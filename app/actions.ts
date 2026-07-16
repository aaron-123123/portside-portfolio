"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getRole, writeRole } from "@/lib/session";
import { queryAsRole } from "@/lib/db";
import { serviceClient, STORAGE_BUCKET } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { notifyClient } from "@/lib/notify";
import { generateText } from "@/lib/ai";
import { extractPdfText } from "@/lib/pdf";
import { checkAiRateLimit } from "@/lib/rateLimit";
import { computeRiskSignals } from "@/lib/risk";
import {
  getActionItems,
  getCheckIns,
  getDocuments,
  getEngagement,
  getMilestones,
  getUpdates,
} from "@/lib/data";
import type {
  ActionItemsDraftContent,
  ExtractedActionItem,
  OwnerSide,
  RiskFlagsDraftContent,
  Role,
  Visibility,
} from "@/lib/types";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const MAX_SUMMARIZE_BYTES = 15 * 1024 * 1024; // 15 MB — base64 + request overhead stays well under Claude's request limit

const ROLE_LABEL: Record<Role, string> = {
  em: "the delivery team (internal EM view)",
  client_contact: "the client project lead",
  client_exec: "the client sponsor (summary-only view, no document access)",
};

/** Switch the viewer between EM, client sponsor, and client project lead. */
export async function setRoleAction(formData: FormData): Promise<void> {
  const requested = String(formData.get("role") ?? "");
  const role: Role =
    requested === "client_exec"
      ? "client_exec"
      : requested === "client_contact"
        ? "client_contact"
        : "em";
  await writeRole(role);
  revalidatePath("/", "layout");
}

/** EM-only: upload a file into an engagement's private or shared space. */
export async function uploadDocumentAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") {
    throw new Error("Only the delivery team (EM view) can upload files.");
  }

  const engagementId = String(formData.get("engagementId") ?? "");
  const visibility = String(formData.get("visibility") ?? "") as Visibility;
  const file = formData.get("file");

  if (!engagementId) throw new Error("Missing engagement.");
  if (visibility !== "private" && visibility !== "shared") {
    throw new Error("Visibility must be private or shared.");
  }
  if (!(file instanceof File) || file.size === 0) {
    throw new Error("Please choose a file to upload.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("File is too large (25 MB maximum).");
  }

  // Store the bytes with the admin Storage client (bucket is private).
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${engagementId}/${crypto.randomUUID()}-${safeName}`;

  const admin = serviceClient();
  const upload = await admin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upload.error) {
    throw new Error(`Upload failed: ${upload.error.message}`);
  }

  // A same-named, currently-latest document in this engagement means this
  // upload is a new version of it, not an unrelated file.
  const existing = await queryAsRole<{ family_id: string; version: number }>(
    "em",
    `select family_id, version from documents
      where engagement_id = $1 and name = $2
      order by version desc limit 1`,
    [engagementId, file.name],
  );
  const priorVersion = existing[0];

  // Insert the metadata row AS the EM role, so the RLS insert policy is
  // genuinely exercised, not just trusted application code.
  let doc: { id: string; name: string; version: number } | undefined;
  try {
    const rows = priorVersion
      ? await queryAsRole<{ id: string; name: string; version: number }>(
          "em",
          `insert into documents (engagement_id, name, storage_path, visibility, uploaded_by_role, family_id, version)
           values ($1, $2, $3, $4, 'em', $5, $6)
           returning id, name, version`,
          [
            engagementId,
            file.name,
            storagePath,
            visibility,
            priorVersion.family_id,
            priorVersion.version + 1,
          ],
        )
      : await queryAsRole<{ id: string; name: string; version: number }>(
          "em",
          `insert into documents (engagement_id, name, storage_path, visibility, uploaded_by_role)
           values ($1, $2, $3, $4, 'em')
           returning id, name, version`,
          [engagementId, file.name, storagePath, visibility],
        );
    doc = rows[0];
  } catch (err) {
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not save document record: ${message}`);
  }
  if (!doc) {
    await admin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    throw new Error("Could not save document record.");
  }

  await writeAudit({
    engagementId,
    documentId: doc.id,
    event: "upload",
    actorRole: role,
    detail:
      doc.version > 1
        ? `Uploaded "${doc.name}" (v${doc.version}) to the ${visibility} space`
        : `Uploaded "${doc.name}" to the ${visibility} space`,
  });

  if (visibility === "shared") {
    await notifyClient({
      engagementId,
      kind: "document",
      summary: `New document shared: ${doc.name}`,
    });
  }

  revalidatePath(`/engagement/${engagementId}`);
  revalidatePath("/");
}

/** EM-only: move a document between the private and shared spaces. */
export async function setVisibilityAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") {
    throw new Error("Only the EM view can change document visibility.");
  }

  const documentId = String(formData.get("documentId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  const visibility = String(formData.get("visibility") ?? "") as Visibility;

  if (!documentId || !engagementId) throw new Error("Missing document.");
  if (visibility !== "private" && visibility !== "shared") {
    throw new Error("Visibility must be private or shared.");
  }

  const rows = await queryAsRole<{ name: string }>(
    "em",
    "update documents set visibility = $1 where id = $2 returning name",
    [visibility, documentId],
  );
  if (!rows[0]) throw new Error("Could not change visibility: document not found.");

  await writeAudit({
    engagementId,
    documentId,
    event: "visibility_change",
    actorRole: role,
    detail: `Moved "${rows[0].name}" to the ${visibility} space`,
  });

  if (visibility === "shared") {
    await notifyClient({
      engagementId,
      kind: "document",
      summary: `Document shared: ${rows[0].name}`,
    });
  }

  revalidatePath(`/engagement/${engagementId}`);
}

/** EM-only: request client sign-off on a shared document. */
export async function requestApprovalAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") {
    throw new Error("Only the EM view can request an approval.");
  }

  const documentId = String(formData.get("documentId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  if (!documentId || !engagementId) throw new Error("Missing document.");

  const docRows = await queryAsRole<{ name: string; visibility: Visibility }>(
    "em",
    "select name, visibility from documents where id = $1",
    [documentId],
  );
  const doc = docRows[0];
  if (!doc) throw new Error("Document not found.");
  if (doc.visibility !== "shared") {
    throw new Error("Approvals can only be requested on shared documents.");
  }

  const inserted = await queryAsRole<{ id: string }>(
    "em",
    `insert into approvals (document_id, engagement_id, status)
     values ($1, $2, 'pending')
     on conflict (document_id) do nothing
     returning id`,
    [documentId, engagementId],
  );
  if (!inserted[0]) {
    throw new Error("An approval has already been requested for this document.");
  }

  await writeAudit({
    engagementId,
    documentId,
    event: "approval_requested",
    actorRole: role,
    detail: `Requested client sign-off on "${doc.name}"`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

/** Client-only: approve a pending sign-off request. */
export async function approveDocumentAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "client_contact") {
    throw new Error("Only the client project lead can approve a document.");
  }

  const approvalId = String(formData.get("approvalId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  const rawName = String(formData.get("approverName") ?? "").trim();
  const approverName = rawName || "Client";
  if (!approvalId || !engagementId) throw new Error("Missing approval.");

  const rows = await queryAsRole<{ document_id: string }>(
    role,
    `update approvals
        set status = 'approved', approved_by = $1, approved_at = now()
      where id = $2 and status = 'pending'
      returning document_id`,
    [approverName, approvalId],
  );
  const approval = rows[0];
  if (!approval) {
    throw new Error("Could not record approval: not found or already approved.");
  }

  const docRows = await queryAsRole<{ name: string }>(
    role,
    "select name from documents where id = $1",
    [approval.document_id],
  );
  const docName = docRows[0]?.name ?? "document";

  await writeAudit({
    engagementId,
    documentId: approval.document_id,
    event: "approved",
    actorRole: role,
    detail: `${approverName} approved "${docName}"`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

/**
 * Add a comment to a shared document. One thread per document, not general
 * chat — deliberately narrow. The sponsor tier can't reach this: it sees no
 * documents at all, so there's never a document id for it to post against.
 */
export async function addDocumentCommentAction(
  formData: FormData,
): Promise<void> {
  const role = await getRole();
  if (role !== "em" && role !== "client_contact") {
    throw new Error(
      "Only the delivery team or the client project lead can comment.",
    );
  }

  const documentId = String(formData.get("documentId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  const rawName = String(formData.get("authorName") ?? "").trim();
  if (!documentId || !engagementId) throw new Error("Missing document.");
  if (!body) throw new Error("Comment cannot be empty.");

  const authorName = rawName || (role === "em" ? "Team" : "Client");

  // Insert AS the role, so the RLS insert policy is genuinely exercised —
  // a client_contact posting against a private document is rejected here,
  // by the database, not by an earlier if-check.
  const rows = await queryAsRole<{ id: string }>(
    role,
    `insert into document_comments (document_id, engagement_id, author_role, author_name, body)
     values ($1, $2, $3, $4, $5)
     returning id`,
    [documentId, engagementId, role, authorName, body],
  );
  if (!rows[0]) {
    throw new Error("Could not add comment: document not visible to you.");
  }

  await writeAudit({
    engagementId,
    documentId,
    event: "comment",
    actorRole: role,
    detail: `${authorName} commented on a document`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Engagement creation (EM only)
// ---------------------------------------------------------------------------

/** EM-only: onboard a new client engagement. */
export async function createEngagementAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") {
    throw new Error("Only the EM view can create an engagement.");
  }

  const clientName = String(formData.get("clientName") ?? "").trim();
  const budgetRaw = String(formData.get("budgetHours") ?? "").trim();
  if (!clientName) throw new Error("Client name is required.");
  const budgetHours = budgetRaw ? Number(budgetRaw) : null;
  if (budgetHours !== null && (!Number.isFinite(budgetHours) || budgetHours <= 0)) {
    throw new Error("Budgeted hours must be a positive number.");
  }

  const rows = await queryAsRole<{ id: string }>(
    "em",
    "insert into engagements (client_name, budget_hours) values ($1, $2) returning id",
    [clientName, budgetHours],
  );
  const engagement = rows[0];
  if (!engagement) throw new Error("Could not create engagement.");

  await writeAudit({
    engagementId: engagement.id,
    documentId: null,
    event: "engagement_created",
    actorRole: role,
    detail: `Created engagement "${clientName}"`,
  });

  revalidatePath("/");
  redirect(`/engagement/${engagement.id}`);
}

// ---------------------------------------------------------------------------
// Time & budget tracking (EM only, internal — deliberately not a billing
// system: no rates, no invoices, just hours logged against a budget).
// ---------------------------------------------------------------------------

/** EM-only: log hours against an engagement. */
export async function logTimeAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can log time.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const loggedBy = String(formData.get("loggedBy") ?? "").trim();
  const hours = Number(formData.get("hours"));
  const note = String(formData.get("note") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (!loggedBy) throw new Error("Your name is required.");
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("Hours must be a positive number.");
  }

  await queryAsRole(
    "em",
    `insert into time_entries (engagement_id, logged_by, hours, note)
     values ($1, $2, $3, $4)`,
    [engagementId, loggedBy, hours, note || null],
  );

  revalidatePath(`/engagement/${engagementId}`);
}

/** EM-only: set or change an engagement's budgeted hours. */
export async function setEngagementBudgetAction(
  formData: FormData,
): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can set the budget.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const budgetRaw = String(formData.get("budgetHours") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  const budgetHours = budgetRaw ? Number(budgetRaw) : null;
  if (budgetHours !== null && (!Number.isFinite(budgetHours) || budgetHours <= 0)) {
    throw new Error("Budgeted hours must be a positive number.");
  }

  const rows = await queryAsRole<{ id: string }>(
    "em",
    "update engagements set budget_hours = $1 where id = $2 returning id",
    [budgetHours, engagementId],
  );
  if (!rows[0]) throw new Error("Engagement not found.");

  revalidatePath(`/engagement/${engagementId}`);
}

/**
 * EM-only: set a client logo + accent color for the engagement page.
 * Decorative only — never applied to a button, chip, or decision control, so
 * it can't compete with coral's reserved meaning (Approve / blocked).
 */
export async function setEngagementBrandingAction(
  formData: FormData,
): Promise<void> {
  const role = await getRole();
  if (role !== "em") {
    throw new Error("Only the EM view can set engagement branding.");
  }

  const engagementId = String(formData.get("engagementId") ?? "");
  const logoUrl = String(formData.get("logoUrl") ?? "").trim();
  const accentColor = String(formData.get("accentColor") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (logoUrl) {
    try {
      new URL(logoUrl);
    } catch {
      throw new Error("Logo must be a valid URL.");
    }
  }
  if (accentColor && !/^#[0-9a-fA-F]{6}$/.test(accentColor)) {
    throw new Error("Accent color must be a hex color like #3366CC.");
  }

  const rows = await queryAsRole<{ id: string }>(
    "em",
    "update engagements set logo_url = $1, accent_color = $2 where id = $3 returning id",
    [logoUrl || null, accentColor || null, engagementId],
  );
  if (!rows[0]) throw new Error("Engagement not found.");

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Engagement lifecycle (EM only)
// ---------------------------------------------------------------------------

/** EM-only: move an engagement between active and archived. */
export async function setEngagementStatusAction(
  formData: FormData,
): Promise<void> {
  const role = await getRole();
  if (role !== "em") {
    throw new Error("Only the EM view can change an engagement's status.");
  }

  const engagementId = String(formData.get("engagementId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!engagementId) throw new Error("Missing engagement.");
  if (status !== "active" && status !== "archived") {
    throw new Error("Status must be active or archived.");
  }

  const rows = await queryAsRole<{ client_name: string }>(
    "em",
    "update engagements set status = $1 where id = $2 returning client_name",
    [status, engagementId],
  );
  if (!rows[0]) throw new Error("Engagement not found.");

  await writeAudit({
    engagementId,
    documentId: null,
    event: "engagement_status",
    actorRole: role,
    detail: `${status === "archived" ? "Archived" : "Reactivated"} the engagement`,
  });

  revalidatePath(`/engagement/${engagementId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Timeline / milestones (EM manages; everyone can view)
// ---------------------------------------------------------------------------

export async function addMilestoneAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can add milestones.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const detail = String(formData.get("detail") ?? "").trim();
  const targetDate = String(formData.get("target_date") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (!title) throw new Error("Milestone title is required.");

  await queryAsRole(
    "em",
    `insert into milestones (engagement_id, title, detail, target_date, assignee, sort_order)
     values ($1, $2, $3, $4, $5,
       coalesce((select max(sort_order) + 1 from milestones where engagement_id = $1), 0))`,
    [engagementId, title, detail || null, targetDate || null, assignee || null],
  );

  await writeAudit({
    engagementId,
    documentId: null,
    event: "milestone",
    actorRole: role,
    detail: `Added milestone "${title}"`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

export async function setMilestoneStatusAction(
  formData: FormData,
): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can update milestones.");

  const milestoneId = String(formData.get("milestoneId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!milestoneId || !engagementId) throw new Error("Missing milestone.");
  if (!["planned", "in_progress", "done", "blocked"].includes(status)) {
    throw new Error("Invalid milestone status.");
  }

  const rows = await queryAsRole<{ title: string }>(
    "em",
    `update milestones
        set status = $1,
            completed_at = case when $1 = 'done' then now() else null end
      where id = $2
      returning title`,
    [status, milestoneId],
  );
  if (!rows[0]) throw new Error("Milestone not found.");

  await writeAudit({
    engagementId,
    documentId: null,
    event: "milestone",
    actorRole: role,
    detail: `Milestone "${rows[0].title}" set to ${status.replace("_", " ")}`,
  });

  if (status === "done") {
    // Open a one-per-milestone pulse check for the client to answer.
    await queryAsRole(
      "em",
      `insert into check_ins (engagement_id, milestone_id, prompt)
       values ($1, $2, $3)
       on conflict (milestone_id) do nothing`,
      [engagementId, milestoneId, `How are we tracking after "${rows[0].title}"?`],
    );
    await notifyClient({
      engagementId,
      kind: "milestone",
      summary: `Milestone completed: ${rows[0].title}`,
    });
  } else if (status === "blocked") {
    await notifyClient({
      engagementId,
      kind: "milestone",
      summary: `Milestone flagged as blocked: ${rows[0].title}`,
    });
  }

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Action items (EM adds; project lead can close client-owned items)
// ---------------------------------------------------------------------------

export async function addActionItemAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can add action items.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const ownerSide = String(formData.get("owner_side") ?? "");
  const dueDate = String(formData.get("due_date") ?? "").trim();
  const assignee = String(formData.get("assignee") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (!title) throw new Error("Action item title is required.");
  if (ownerSide !== "team" && ownerSide !== "client") {
    throw new Error("Owner must be team or client.");
  }

  await queryAsRole(
    "em",
    `insert into action_items (engagement_id, title, owner_side, due_date, assignee)
     values ($1, $2, $3, $4, $5)`,
    [engagementId, title, ownerSide, dueDate || null, ownerSide === "team" ? assignee || null : null],
  );

  await writeAudit({
    engagementId,
    documentId: null,
    event: "action_item",
    actorRole: role,
    detail: `Added action item "${title}" (owner: ${ownerSide === "team" ? "Team" : "Client"})`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

export async function completeActionItemAction(
  formData: FormData,
): Promise<void> {
  const role = await getRole();
  if (role !== "em" && role !== "client_contact") {
    throw new Error("You cannot update this action item.");
  }

  const actionId = String(formData.get("actionId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  if (!actionId || !engagementId) throw new Error("Missing action item.");

  // RLS additionally restricts the project lead to client-owned items.
  const rows = await queryAsRole<{ title: string }>(
    role,
    `update action_items
        set status = 'done', completed_at = now()
      where id = $1
      returning title`,
    [actionId],
  );
  if (!rows[0]) throw new Error("Action item not found or not permitted.");

  await writeAudit({
    engagementId,
    documentId: null,
    event: "action_item",
    actorRole: role,
    detail: `Completed action item "${rows[0].title}"`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Pulse / CSAT (client submits; opened automatically on milestone completion)
// ---------------------------------------------------------------------------

export async function submitPulseAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "client_contact" && role !== "client_exec") {
    throw new Error("Only a client view can submit a pulse.");
  }

  const checkInId = String(formData.get("checkInId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  const score = Number(formData.get("score"));
  const comment = String(formData.get("comment") ?? "").trim();
  const rawName = String(formData.get("submittedBy") ?? "").trim();
  const submittedBy = rawName || (role === "client_exec" ? "Sponsor" : "Client");

  if (!checkInId || !engagementId) throw new Error("Missing pulse.");
  if (!Number.isInteger(score) || score < 1 || score > 5) {
    throw new Error("Score must be between 1 and 5.");
  }

  const rows = await queryAsRole<{ prompt: string }>(
    role,
    `update check_ins
        set status = 'submitted', score = $1, comment = $2,
            submitted_by = $3, submitted_at = now()
      where id = $4 and status = 'pending'
      returning prompt`,
    [score, comment || null, submittedBy, checkInId],
  );
  if (!rows[0]) throw new Error("Pulse not found or already submitted.");

  await writeAudit({
    engagementId,
    documentId: null,
    event: "pulse",
    actorRole: role,
    detail: `${submittedBy} submitted a pulse: ${score}/5`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// AI features
//
// Every action below runs the SAME role-scoped data helpers the page itself
// uses (lib/data.ts), so whatever context Claude receives has already been
// filtered by Row Level Security — the access boundary extends to the AI
// layer, not just page rendering. See lib/ai.ts for the model wrapper and
// lib/rateLimit.ts for the public-demo usage cap.
// ---------------------------------------------------------------------------

/** Any role: ask a question about the engagement, answered only from what that role can see. */
export async function askPortsideAction(formData: FormData): Promise<void> {
  const role = await getRole();
  const engagementId = String(formData.get("engagementId") ?? "");
  const question = String(formData.get("question") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (!question) throw new Error("Please enter a question.");
  if (question.length > 500) {
    throw new Error("Question is too long (500 characters max).");
  }

  await checkAiRateLimit(engagementId, "ask");

  const [engagement, milestones, actionItems, checkIns, updates] = await Promise.all([
    getEngagement(engagementId),
    getMilestones(engagementId),
    getActionItems(engagementId),
    getCheckIns(engagementId),
    getUpdates(engagementId, 20),
  ]);
  // Sponsor tier gets no documents — enforced by RLS elsewhere; mirror that
  // here by simply not querying, same as the engagement page does.
  const documents =
    role === "em" || role === "client_contact" ? await getDocuments(engagementId) : [];

  const context = {
    engagement: engagement && { client_name: engagement.client_name, status: engagement.status },
    milestones: milestones.map((m) => ({
      title: m.title,
      detail: m.detail,
      status: m.status,
      target_date: m.target_date,
      assignee: m.assignee,
    })),
    action_items: actionItems.map((a) => ({
      title: a.title,
      owner_side: a.owner_side,
      status: a.status,
      due_date: a.due_date,
      assignee: a.assignee,
    })),
    pulse_checks: checkIns
      .filter((c) => c.status === "submitted")
      .map((c) => ({ prompt: c.prompt, score: c.score, comment: c.comment })),
    recent_updates: updates.map((u) => ({ summary: u.summary, created_at: u.created_at })),
    documents: documents.map((d) => ({
      name: d.name,
      visibility: d.visibility,
      version: d.version,
      approved: d.approvals?.[0]?.status === "approved",
    })),
  };

  const answer = await generateText({
    system:
      `You are "Ask Portside", an assistant embedded in a professional-services client-delivery portal. ` +
      `You are answering as if speaking to ${ROLE_LABEL[role]}. ` +
      `Answer ONLY using the JSON data provided in the user message — it has already been filtered to exactly ` +
      `what this viewer's role is allowed to see under this app's real access-control policy, not as a formatting choice. ` +
      `If the answer isn't present in the data, say so plainly rather than guessing. Never invent milestones, ` +
      `documents, dates, names, or scores. Keep the answer to 2-4 sentences unless the question needs a short list. ` +
      `Plain prose, no markdown headers.`,
    content: [{ type: "text", text: `Question: ${question}\n\nData:\n${JSON.stringify(context)}` }],
    maxTokens: 500,
  });

  const rows = await queryAsRole<{ id: string }>(
    role,
    `insert into ai_answers (engagement_id, asked_by_role, question, answer)
     values ($1, $2, $3, $4)
     returning id`,
    [engagementId, role, question, answer],
  );
  if (!rows[0]) throw new Error("Could not save the answer.");

  await writeAudit({
    engagementId,
    documentId: null,
    event: "ai",
    actorRole: role,
    detail: `Asked Portside: "${question.length > 80 ? `${question.slice(0, 80)}…` : question}"`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// AI status-digest generator (EM only)
// ---------------------------------------------------------------------------

/** EM-only: draft a client-ready status update from current engagement data. */
export async function generateStatusDigestAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can generate a status digest.");

  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) throw new Error("Missing engagement.");

  await checkAiRateLimit(engagementId, "status_digest");

  const [engagement, milestones, actionItems, checkIns, updates] = await Promise.all([
    getEngagement(engagementId),
    getMilestones(engagementId),
    getActionItems(engagementId),
    getCheckIns(engagementId),
    getUpdates(engagementId, 10),
  ]);

  const context = {
    client_name: engagement?.client_name,
    milestones: milestones.map((m) => ({ title: m.title, status: m.status, target_date: m.target_date })),
    open_action_items: actionItems.filter((a) => a.status === "open").length,
    recent_pulse: checkIns.find((c) => c.status === "submitted")?.score ?? null,
    recent_updates: updates.map((u) => u.summary),
  };

  const text = await generateText({
    system:
      "Draft a short, client-ready status update paragraph (3-5 sentences) for a professional-services " +
      "engagement, based only on the JSON data provided. Plain prose, no markdown, no headers, ready to paste " +
      "directly into a client-facing status feed. Do not invent facts not present in the data.",
    content: [{ type: "text", text: JSON.stringify(context) }],
    maxTokens: 400,
  });

  await queryAsRole(
    "em",
    `insert into ai_drafts (engagement_id, kind, content, created_by_role)
     values ($1, 'status_digest', $2::jsonb, 'em')`,
    [engagementId, JSON.stringify({ text })],
  );

  await writeAudit({
    engagementId,
    documentId: null,
    event: "ai",
    actorRole: role,
    detail: "Generated an AI status-digest draft",
  });

  revalidatePath(`/engagement/${engagementId}`);
}

/** EM-only: post the (possibly edited) status digest to the client Updates feed. */
export async function publishStatusDigestAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can post a status update.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (!text) throw new Error("The status update cannot be empty.");

  await notifyClient({ engagementId, kind: "status", summary: text });

  await writeAudit({
    engagementId,
    documentId: null,
    event: "ai",
    actorRole: role,
    detail: "Posted an AI-drafted status update to the client feed",
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// AI risk flagging (EM only) — signal DETECTION is deterministic (lib/risk.ts,
// runs with no AI key needed); this action only adds a one-line AI "why".
// ---------------------------------------------------------------------------

const RISK_NOTES_SCHEMA = {
  type: "object",
  properties: {
    notes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          ref: { type: "string" },
          note: { type: "string" },
        },
        required: ["ref", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["notes"],
  additionalProperties: false,
} as const;

/** EM-only: phrase a one-line "why it matters" note for each detected risk signal. */
export async function analyzeRisksAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can run risk analysis.");

  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) throw new Error("Missing engagement.");

  const [milestones, actionItems, checkIns] = await Promise.all([
    getMilestones(engagementId),
    getActionItems(engagementId),
    getCheckIns(engagementId),
  ]);
  const signals = computeRiskSignals(milestones, actionItems, checkIns);
  if (signals.length === 0) {
    throw new Error("No risk signals detected right now — nothing to analyze.");
  }

  await checkAiRateLimit(engagementId, "risk_flags");

  const text = await generateText({
    system:
      "For each risk signal below, write ONE short sentence (under 20 words) explaining why it matters to the " +
      "delivery team, in plain, direct language. Return JSON matching the schema exactly — one note per ref, " +
      "same refs as given, no extra commentary.",
    content: [{ type: "text", text: JSON.stringify(signals) }],
    maxTokens: 600,
    jsonSchema: { name: "risk_notes", schema: RISK_NOTES_SCHEMA },
  });

  let parsed: RiskFlagsDraftContent;
  try {
    parsed = JSON.parse(text) as RiskFlagsDraftContent;
  } catch {
    throw new Error("AI returned an unreadable response — please try again.");
  }

  await queryAsRole(
    "em",
    `insert into ai_drafts (engagement_id, kind, content, created_by_role)
     values ($1, 'risk_flags', $2::jsonb, 'em')`,
    [engagementId, JSON.stringify(parsed)],
  );

  await writeAudit({
    engagementId,
    documentId: null,
    event: "ai",
    actorRole: role,
    detail: `Explained ${signals.length} risk signal(s) with AI`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Meeting notes → structured action items (EM only)
// ---------------------------------------------------------------------------

const ACTION_ITEMS_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          assignee: { anyOf: [{ type: "string" }, { type: "null" }] },
          due_date: { anyOf: [{ type: "string" }, { type: "null" }] },
          owner_side: { type: "string", enum: ["team", "client"] },
        },
        required: ["title", "assignee", "due_date", "owner_side"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
} as const;

/** EM-only: draft structured action items extracted from pasted meeting notes. */
export async function extractActionItemsAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can extract action items.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const notes = String(formData.get("notes") ?? "").trim();
  if (!engagementId) throw new Error("Missing engagement.");
  if (!notes) throw new Error("Paste some meeting notes first.");
  if (notes.length > 8000) {
    throw new Error("Notes are too long (8,000 characters max) — try a shorter excerpt.");
  }

  await checkAiRateLimit(engagementId, "extract_actions");

  const text = await generateText({
    system:
      "Extract discrete action items from these raw meeting notes. Only include concrete, actionable tasks — " +
      "not general discussion or decisions already made. For each: a short title; an assignee name only if a " +
      "specific person is clearly mentioned (otherwise null); a due_date in YYYY-MM-DD format only if a specific " +
      "date is clearly mentioned (otherwise null); and owner_side — 'client' if the task is the client's " +
      "responsibility, 'team' otherwise. If you find no actionable items, return an empty items array. Never " +
      "invent a task, name, or date that isn't in the notes.",
    content: [{ type: "text", text: notes }],
    maxTokens: 1200,
    jsonSchema: { name: "action_items", schema: ACTION_ITEMS_SCHEMA },
  });

  let parsed: ActionItemsDraftContent;
  try {
    parsed = JSON.parse(text) as ActionItemsDraftContent;
  } catch {
    throw new Error("AI returned an unreadable response — please try again.");
  }
  parsed.items = parsed.items.slice(0, 20); // defensive cap

  await queryAsRole(
    "em",
    `insert into ai_drafts (engagement_id, kind, content, created_by_role)
     values ($1, 'action_items', $2::jsonb, 'em')`,
    [engagementId, JSON.stringify(parsed)],
  );

  await writeAudit({
    engagementId,
    documentId: null,
    event: "ai",
    actorRole: role,
    detail: `Extracted ${parsed.items.length} action item(s) from pasted meeting notes`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** EM-only: create real action items from the selected rows of an extraction draft. */
export async function addExtractedActionItemsAction(formData: FormData): Promise<void> {
  const role = await getRole();
  if (role !== "em") throw new Error("Only the EM view can add action items.");

  const engagementId = String(formData.get("engagementId") ?? "");
  const draftId = String(formData.get("draftId") ?? "");
  if (!engagementId || !draftId) throw new Error("Missing draft.");

  const selected = new Set(formData.getAll("include").map(String));
  if (selected.size === 0) {
    throw new Error("Select at least one item to add.");
  }

  // Re-read the draft from the database rather than trusting resubmitted form
  // content — the draft row is the trusted source, the checkboxes just pick indices.
  const rows = await queryAsRole<{ content: ActionItemsDraftContent }>(
    "em",
    "select content from ai_drafts where id = $1 and kind = 'action_items' and engagement_id = $2",
    [draftId, engagementId],
  );
  const draft = rows[0];
  if (!draft) throw new Error("Draft not found.");

  const items: ExtractedActionItem[] = draft.content.items ?? [];
  let added = 0;
  for (const [index, item] of items.entries()) {
    if (!selected.has(String(index))) continue;
    const title = item.title?.trim();
    if (!title) continue;
    const ownerSide: OwnerSide = item.owner_side === "client" ? "client" : "team";
    const dueDate = item.due_date && DATE_RE.test(item.due_date) ? item.due_date : null;
    const assignee = ownerSide === "team" && item.assignee ? item.assignee.trim() || null : null;

    await queryAsRole(
      "em",
      `insert into action_items (engagement_id, title, owner_side, due_date, assignee)
       values ($1, $2, $3, $4, $5)`,
      [engagementId, title, ownerSide, dueDate, assignee],
    );
    added += 1;
  }

  if (added === 0) throw new Error("No valid items were selected.");

  await writeAudit({
    engagementId,
    documentId: null,
    event: "action_item",
    actorRole: role,
    detail: `Added ${added} action item(s) extracted from meeting notes`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}

// ---------------------------------------------------------------------------
// Per-document AI summarize
// ---------------------------------------------------------------------------

// "pdf" is handled separately (text-extracted via lib/pdf.ts) rather than
// sent as raw bytes — native PDF understanding isn't a guaranteed
// OpenRouter/OpenAI-compatible capability across arbitrary models.
const SUMMARIZABLE_EXTENSIONS: Record<string, "pdf" | "image" | "text"> = {
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  txt: "text",
  md: "text",
  csv: "text",
  json: "text",
};

const MEDIA_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Any role that can already see the document: summarize its contents with AI. */
export async function summarizeDocumentAction(formData: FormData): Promise<void> {
  const role = await getRole();
  const documentId = String(formData.get("documentId") ?? "");
  const engagementId = String(formData.get("engagementId") ?? "");
  if (!documentId || !engagementId) throw new Error("Missing document.");

  // Re-check visibility AS the role, exactly like the download route — RLS
  // decides, not the UI. A private document is simply not found here for a
  // client role, so summarization never sees its bytes. Also require the
  // document to actually belong to the claimed engagementId (mirrors
  // addExtractedActionItemsAction) — otherwise a caller could spread AI
  // calls across engagements' rate-limit buckets by citing a real document
  // alongside an unrelated engagementId.
  const docRows = await queryAsRole<{ name: string; storage_path: string }>(
    role,
    "select name, storage_path from documents where id = $1 and engagement_id = $2",
    [documentId, engagementId],
  );
  const doc = docRows[0];
  if (!doc) throw new Error("This document is not available to your current view.");

  const ext = doc.name.split(".").pop()?.toLowerCase() ?? "";
  const kind = SUMMARIZABLE_EXTENSIONS[ext];
  if (!kind) {
    throw new Error(
      "This file type isn't supported for AI summarization yet — try a PDF, image, or plain text file.",
    );
  }

  await checkAiRateLimit(engagementId, "summarize");

  const download = await serviceClient().storage.from(STORAGE_BUCKET).download(doc.storage_path);
  if (download.error || !download.data) {
    throw new Error("Could not read the file to summarize it.");
  }
  if (download.data.size > MAX_SUMMARIZE_BYTES) {
    throw new Error("File is too large to summarize (15 MB max).");
  }

  const buffer = Buffer.from(await download.data.arrayBuffer());
  const system =
    "Summarize this document in 3-5 sentences for someone working a professional-services client engagement. " +
    "Be factual and concise. If the document is empty, unreadable, or not meaningfully summarizable, say so plainly.";

  let answer: string;
  if (kind === "image") {
    answer = await generateText({
      system,
      content: [
        { type: "image", media_type: MEDIA_TYPE[ext], base64: buffer.toString("base64") },
        { type: "text", text: "Summarize this document." },
      ],
      maxTokens: 400,
    });
  } else {
    const text =
      kind === "pdf" ? await extractPdfText(buffer) : buffer.toString("utf-8");
    if (!text.trim()) {
      throw new Error("Couldn't extract any text from this file to summarize.");
    }
    answer = await generateText({
      system,
      content: [{ type: "text", text: `Document "${doc.name}":\n\n${text}` }],
      maxTokens: 400,
    });
  }

  await queryAsRole(
    role,
    `insert into ai_answers (engagement_id, document_id, asked_by_role, question, answer)
     values ($1, $2, $3, $4, $5)`,
    [engagementId, documentId, role, `Summarize "${doc.name}"`, answer],
  );

  await writeAudit({
    engagementId,
    documentId,
    event: "ai",
    actorRole: role,
    detail: `Summarized "${doc.name}" with AI`,
  });

  revalidatePath(`/engagement/${engagementId}`);
}
