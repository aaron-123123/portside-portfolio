// ============================================================================
// Pit Wall — seed script.
// Creates a sample set of client engagements with private/shared documents,
// real uploaded placeholder PDFs, and one pending approval.
//
// Run with:  npm run seed   (loads .env.local via Node's --env-file)
// Safe to re-run: it uses fixed engagement IDs and replaces their data.
// ============================================================================

import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

const BUCKET = "documents";
// Assigned inside seed() so this file can be imported (e.g. for testing makePdf)
// without requiring environment variables.
let admin;

// --- Minimal valid PDF generator (so placeholder files really open) --------

function makePdf(title, lines) {
  const esc = (s) => s.replace(/([()\\])/g, "\\$1");
  const content =
    `BT /F1 20 Tf 72 720 Td (${esc(title)}) Tj ET\n` +
    lines
      .map((l, i) => `BT /F1 12 Tf 72 ${688 - i * 20} Td (${esc(l)}) Tj ET`)
      .join("\n") +
    "\n";

  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, idx) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${idx + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  const size = objs.length + 1;
  pdf += `xref\n0 ${size}\n0000000000 65535 f \n`;
  offsets.forEach((off) => {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(pdf, "latin1");
}

// --- Sample data -----------------------------------------------------------

const engagements = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    client_name: "Meridian Super",
    docs: [
      {
        name: "Risk Assessment - Draft v0.3.pdf",
        visibility: "private",
        body: ["Internal working draft. Not for client distribution.", "Owner: delivery team."],
      },
      {
        name: "Internal Delivery Notes.pdf",
        visibility: "private",
        body: ["Meeting notes, open questions, and internal actions."],
      },
      {
        name: "Governance Framework v2.pdf",
        visibility: "shared",
        approval: "pending",
        body: ["Proposed governance framework for board review.", "Awaiting client sign-off."],
      },
      {
        name: "Rollout Roadmap - Q3.pdf",
        visibility: "shared",
        body: ["Phased rollout plan across business units."],
      },
    ],
    milestones: [
      { title: "Discovery & risk assessment", detail: "Baseline current risk exposure.", target_date: "2026-05-15", status: "done", pulse: { status: "submitted", score: 5, comment: "Thorough and well-run kickoff.", by: "Jordan Ellis" } },
      { title: "Governance framework draft", detail: "First draft of the governance framework.", target_date: "2026-06-20", status: "done", pulse: { status: "pending" } },
      { title: "Board review & sign-off", detail: "Present the framework to the board for approval.", target_date: "2026-07-25", status: "in_progress" },
      { title: "Rollout - phase 1", detail: "Roll out approved controls to the first business units.", target_date: "2026-08-15", status: "planned" },
      { title: "Post-implementation review", detail: null, target_date: "2026-09-30", status: "planned" },
    ],
    actions: [
      { title: "Confirm board meeting date", owner_side: "client", due_date: "2026-07-20", status: "open" },
      { title: "Finalise Governance Framework v2", owner_side: "team", due_date: "2026-07-22", status: "open" },
      { title: "Share updated systems inventory", owner_side: "client", due_date: "2026-06-18", status: "done" },
    ],
    updates: [
      { kind: "milestone", summary: "Milestone completed: Discovery & risk assessment" },
      { kind: "document", summary: "New document shared: Governance Framework v2.pdf" },
      { kind: "milestone", summary: "Milestone completed: Governance framework draft" },
      { kind: "document", summary: "New document shared: Rollout Roadmap - Q3.pdf" },
    ],
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    client_name: "Coastline Health Network",
    docs: [
      {
        name: "Systems Inventory - Internal.pdf",
        visibility: "private",
        body: ["Register of systems under review. Internal only."],
      },
      {
        name: "Compliance Policy - Draft.pdf",
        visibility: "shared",
        body: ["Draft compliance policy shared for client comment."],
      },
    ],
    milestones: [
      { title: "Discovery workshop", detail: "Map clinical systems in scope.", target_date: "2026-05-10", status: "done", pulse: { status: "submitted", score: 4, comment: "Good pace, clear next steps.", by: "Priya Nair" } },
      { title: "Compliance policy draft", detail: "Draft the compliance policy for review.", target_date: "2026-06-30", status: "in_progress" },
      { title: "Policy adoption", detail: null, target_date: "2026-08-01", status: "planned" },
    ],
    actions: [
      { title: "Review Compliance Policy draft", owner_side: "client", due_date: "2026-07-18", status: "open" },
      { title: "Incorporate clinical safety feedback", owner_side: "team", due_date: null, status: "open" },
    ],
    updates: [
      { kind: "milestone", summary: "Milestone completed: Discovery workshop" },
      { kind: "document", summary: "New document shared: Compliance Policy - Draft.pdf" },
    ],
  },
  {
    id: "33333333-3333-4333-8333-333333333333",
    client_name: "Nardoo Water Authority",
    docs: [
      {
        name: "Stakeholder Map.pdf",
        visibility: "private",
        body: ["Internal stakeholder mapping for the engagement."],
      },
      {
        name: "Kickoff Summary.pdf",
        visibility: "shared",
        body: ["Summary of the kickoff workshop and agreed next steps."],
      },
    ],
    milestones: [
      { title: "Kickoff & scoping", detail: "Agree scope and success measures.", target_date: "2026-06-01", status: "done", pulse: { status: "submitted", score: 4, comment: "Solid start.", by: "Sam Ford" } },
      { title: "Data access & stakeholder mapping", detail: "Blocked pending data warehouse access.", target_date: "2026-07-10", status: "blocked" },
      { title: "Governance recommendations", detail: null, target_date: "2026-08-20", status: "planned" },
    ],
    actions: [
      { title: "Grant data warehouse access", owner_side: "client", due_date: "2026-07-12", status: "open" },
      { title: "Draft stakeholder map", owner_side: "team", due_date: null, status: "done" },
    ],
    updates: [
      { kind: "milestone", summary: "Milestone completed: Kickoff & scoping" },
      { kind: "document", summary: "New document shared: Kickoff Summary.pdf" },
      { kind: "milestone", summary: "Milestone flagged as blocked: Data access & stakeholder mapping" },
    ],
  },
];

// --- Seed routine ----------------------------------------------------------

async function ensureBucket() {
  const { data } = await admin.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await admin.storage.createBucket(BUCKET, { public: false });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Could not create bucket: ${error.message}`);
    }
  }
}

async function insert(table, row) {
  const { data, error } = await admin.from(table).insert(row).select().single();
  if (error) throw new Error(`Insert into ${table} failed: ${error.message}`);
  return data;
}

async function seed() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
        "Make sure .env.local exists and you ran: npm run seed",
    );
    process.exit(1);
  }
  admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("Pit Wall seed starting...");
  await ensureBucket();

  for (const eng of engagements) {
    // Replace any previous data for this engagement (cascade clears children).
    await admin.from("engagements").delete().eq("id", eng.id);
    await insert("engagements", { id: eng.id, client_name: eng.client_name });
    console.log(`  Engagement: ${eng.client_name}`);

    for (let i = 0; i < eng.docs.length; i++) {
      const d = eng.docs[i];
      const safeName = d.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${eng.id}/seed-${i}-${safeName}`;
      const pdf = makePdf(d.name.replace(/\.pdf$/i, ""), d.body);

      const up = await admin.storage
        .from(BUCKET)
        .upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (up.error) throw new Error(`Upload failed for ${d.name}: ${up.error.message}`);

      const doc = await insert("documents", {
        engagement_id: eng.id,
        name: d.name,
        storage_path: path,
        visibility: d.visibility,
        uploaded_by_role: "em",
      });

      await insert("audit_log", {
        engagement_id: eng.id,
        document_id: doc.id,
        event: "upload",
        actor_role: "em",
        detail: `Uploaded "${d.name}" to the ${d.visibility} space`,
      });

      if (d.approval === "pending") {
        await insert("approvals", {
          document_id: doc.id,
          engagement_id: eng.id,
          status: "pending",
        });
        await insert("audit_log", {
          engagement_id: eng.id,
          document_id: doc.id,
          event: "approval_requested",
          actor_role: "em",
          detail: `Requested client sign-off on "${d.name}"`,
        });
      }

      console.log(`    - ${d.visibility.padEnd(7)} ${d.name}`);
    }

    const milestones = eng.milestones ?? [];
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      const ms = await insert("milestones", {
        engagement_id: eng.id,
        title: m.title,
        detail: m.detail ?? null,
        target_date: m.target_date ?? null,
        status: m.status,
        sort_order: i,
        completed_at:
          m.status === "done" && m.target_date
            ? `${m.target_date}T10:00:00Z`
            : null,
      });

      if (m.pulse) {
        await insert("check_ins", {
          engagement_id: eng.id,
          milestone_id: ms.id,
          prompt: `How are we tracking after "${m.title}"?`,
          status: m.pulse.status,
          score: m.pulse.score ?? null,
          comment: m.pulse.comment ?? null,
          submitted_by: m.pulse.status === "submitted" ? m.pulse.by ?? "Client" : null,
          submitted_at:
            m.pulse.status === "submitted" && m.target_date
              ? `${m.target_date}T14:00:00Z`
              : null,
        });
      }
    }

    for (const a of eng.actions ?? []) {
      await insert("action_items", {
        engagement_id: eng.id,
        title: a.title,
        owner_side: a.owner_side,
        status: a.status,
        due_date: a.due_date ?? null,
        completed_at:
          a.status === "done"
            ? `${a.due_date ?? "2026-07-01"}T10:00:00Z`
            : null,
      });
    }

    for (const u of eng.updates ?? []) {
      await insert("updates", {
        engagement_id: eng.id,
        kind: u.kind,
        summary: u.summary,
      });
    }

    console.log(
      `    ~ ${milestones.length} milestones, ${(eng.actions ?? []).length} action items, ${(eng.updates ?? []).length} updates`,
    );
  }

  console.log("Seed complete.");
}

export { makePdf };

// Only run the seed when executed directly (npm run seed), not when imported.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  seed().catch((err) => {
    console.error("\nSeed failed:", err.message);
    process.exit(1);
  });
}
