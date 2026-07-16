"use server";

import { revalidatePath } from "next/cache";
import { getRole, writeRole } from "@/lib/session";
import { queryAsRole } from "@/lib/db";
import { serviceClient, STORAGE_BUCKET } from "@/lib/supabase";
import { writeAudit } from "@/lib/audit";
import { notifyClient } from "@/lib/notify";
import type { Role, Visibility } from "@/lib/types";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB

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

  // Insert the metadata row AS the EM role, so the RLS insert policy is
  // genuinely exercised, not just trusted application code.
  let doc: { id: string; name: string } | undefined;
  try {
    const rows = await queryAsRole<{ id: string; name: string }>(
      "em",
      `insert into documents (engagement_id, name, storage_path, visibility, uploaded_by_role)
       values ($1, $2, $3, $4, 'em')
       returning id, name`,
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
    detail: `Uploaded "${doc.name}" to the ${visibility} space`,
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
  if (!engagementId) throw new Error("Missing engagement.");
  if (!title) throw new Error("Milestone title is required.");

  await queryAsRole(
    "em",
    `insert into milestones (engagement_id, title, detail, target_date, sort_order)
     values ($1, $2, $3, $4,
       coalesce((select max(sort_order) + 1 from milestones where engagement_id = $1), 0))`,
    [engagementId, title, detail || null, targetDate || null],
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
  if (!engagementId) throw new Error("Missing engagement.");
  if (!title) throw new Error("Action item title is required.");
  if (ownerSide !== "team" && ownerSide !== "client") {
    throw new Error("Owner must be team or client.");
  }

  await queryAsRole(
    "em",
    `insert into action_items (engagement_id, title, owner_side, due_date)
     values ($1, $2, $3, $4)`,
    [engagementId, title, ownerSide, dueDate || null],
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
