// Automates the access-control claim from the README: that a client role
// cannot read a private document or the audit log, even by exact id, because
// the database itself refuses the row (RLS), not the server's UI logic.
//
// Runs read-only queries through the same queryAsRole() the app uses in
// production, against the real configured DATABASE_URL — no mutations, no
// seed data required beyond what already exists.
import assert from "node:assert/strict";
import test from "node:test";
import { queryAsAdmin, queryAsRole } from "../lib/db.ts";

test("client_exec (sponsor) reads zero documents, private or shared", async () => {
  const anyDoc = await queryAsRole<{ id: string }>(
    "em",
    "select id from documents limit 1",
  );
  assert.ok(anyDoc.length > 0, "seed data must contain at least one document");

  const asSponsor = await queryAsRole(
    "client_exec",
    "select id from documents",
  );
  assert.equal(
    asSponsor.length,
    0,
    "client_exec must never see a document row",
  );
});

test("client_contact (project lead) cannot read a private document by exact id", async () => {
  const privateDoc = await queryAsRole<{ id: string }>(
    "em",
    "select id from documents where visibility = 'private' limit 1",
  );
  assert.ok(
    privateDoc.length > 0,
    "seed data must contain at least one private document",
  );

  const asContact = await queryAsRole(
    "client_contact",
    "select id from documents where id = $1",
    [privateDoc[0].id],
  );
  assert.equal(
    asContact.length,
    0,
    "client_contact must not be able to read a private document, even by its exact id",
  );
});

test("client_contact CAN read a shared document", async () => {
  const sharedDoc = await queryAsRole<{ id: string }>(
    "em",
    "select id from documents where visibility = 'shared' limit 1",
  );
  assert.ok(
    sharedDoc.length > 0,
    "seed data must contain at least one shared document",
  );

  const asContact = await queryAsRole(
    "client_contact",
    "select id from documents where id = $1",
    [sharedDoc[0].id],
  );
  assert.equal(
    asContact.length,
    1,
    "client_contact should be able to read a shared document",
  );
});

test("neither client tier can read the audit log", async () => {
  const asEm = await queryAsRole("em", "select id from audit_log limit 1");
  assert.ok(asEm.length > 0, "seed data must contain at least one audit_log row");

  const asContact = await queryAsRole(
    "client_contact",
    "select id from audit_log",
  );
  const asSponsor = await queryAsRole(
    "client_exec",
    "select id from audit_log",
  );
  assert.equal(asContact.length, 0, "client_contact must not read audit_log");
  assert.equal(asSponsor.length, 0, "client_exec must not read audit_log");
});

// ---------------------------------------------------------------------------
// AI features — same RLS-first pattern as above, proving the access boundary
// extends to what the AI layer is allowed to see and store, not just pages.
// ---------------------------------------------------------------------------

test("ai_answers: a role only sees its own asked-under-role questions, EM sees all", async () => {
  const engagement = await queryAsRole<{ id: string }>(
    "em",
    "select id from engagements limit 1",
  );
  assert.ok(engagement.length > 0, "seed data must contain at least one engagement");
  const engagementId = engagement[0].id;

  const inserted = await queryAsAdmin<{ id: string }>(
    `insert into ai_answers (engagement_id, asked_by_role, question, answer)
     values ($1, 'client_exec', 'RLS test question', 'RLS test answer')
     returning id`,
    [engagementId],
  );
  const answerId = inserted[0].id;

  try {
    const asSponsor = await queryAsRole(
      "client_exec",
      "select id from ai_answers where id = $1",
      [answerId],
    );
    assert.equal(
      asSponsor.length,
      1,
      "client_exec should see a question it asked itself",
    );

    const asContact = await queryAsRole(
      "client_contact",
      "select id from ai_answers where id = $1",
      [answerId],
    );
    assert.equal(
      asContact.length,
      0,
      "client_contact must not see a question asked under client_exec's role",
    );

    const asEm = await queryAsRole(
      "em",
      "select id from ai_answers where id = $1",
      [answerId],
    );
    assert.equal(asEm.length, 1, "em should see every role's questions");
  } finally {
    await queryAsAdmin("delete from ai_answers where id = $1", [answerId]);
  }
});

test("ai_answers insert is rejected when asked_by_role doesn't match the request's own role", async () => {
  const engagement = await queryAsRole<{ id: string }>(
    "em",
    "select id from engagements limit 1",
  );
  const engagementId = engagement[0].id;

  await assert.rejects(
    queryAsRole(
      "client_contact",
      `insert into ai_answers (engagement_id, asked_by_role, question, answer)
       values ($1, 'em', 'spoofed question', 'spoofed answer')`,
      [engagementId],
    ),
    "a client_contact request must not be able to insert a row claiming asked_by_role = 'em'",
  );
});

test("ai_answers insert is rejected when document_id belongs to a different engagement", async () => {
  const sharedDoc = await queryAsRole<{ id: string; engagement_id: string }>(
    "em",
    "select id, engagement_id from documents where visibility = 'shared' limit 1",
  );
  assert.ok(sharedDoc.length > 0, "seed data must contain at least one shared document");

  const otherEngagement = await queryAsRole<{ id: string }>(
    "em",
    "select id from engagements where id != $1 limit 1",
    [sharedDoc[0].engagement_id],
  );
  assert.ok(
    otherEngagement.length > 0,
    "seed data must contain at least two engagements",
  );

  await assert.rejects(
    queryAsRole(
      "em",
      `insert into ai_answers (engagement_id, document_id, asked_by_role, question, answer)
       values ($1, $2, 'em', 'mismatched engagement test', 'x')`,
      [otherEngagement[0].id, sharedDoc[0].id],
    ),
    "a document_id from one engagement must not attach to an ai_answers row claiming a different engagement_id",
  );
});

test("ai_drafts and ai_usage_log are EM-only, invisible to both client tiers", async () => {
  const engagement = await queryAsRole<{ id: string }>(
    "em",
    "select id from engagements limit 1",
  );
  const engagementId = engagement[0].id;

  const draft = await queryAsAdmin<{ id: string }>(
    `insert into ai_drafts (engagement_id, kind, content, created_by_role)
     values ($1, 'status_digest', '{"text":"RLS test draft"}'::jsonb, 'em')
     returning id`,
    [engagementId],
  );
  await queryAsAdmin(
    "insert into ai_usage_log (engagement_id, feature) values ($1, 'rls-test')",
    [engagementId],
  );

  try {
    const asEmDrafts = await queryAsRole(
      "em",
      "select id from ai_drafts where id = $1",
      [draft[0].id],
    );
    assert.equal(asEmDrafts.length, 1, "em should read ai_drafts");

    const asContactDrafts = await queryAsRole(
      "client_contact",
      "select id from ai_drafts where id = $1",
      [draft[0].id],
    );
    const asSponsorDrafts = await queryAsRole(
      "client_exec",
      "select id from ai_drafts where id = $1",
      [draft[0].id],
    );
    assert.equal(asContactDrafts.length, 0, "client_contact must not read ai_drafts");
    assert.equal(asSponsorDrafts.length, 0, "client_exec must not read ai_drafts");

    const asContactUsage = await queryAsRole(
      "client_contact",
      "select id from ai_usage_log where engagement_id = $1",
      [engagementId],
    );
    assert.equal(
      asContactUsage.length,
      0,
      "client_contact must not read ai_usage_log",
    );
  } finally {
    await queryAsAdmin("delete from ai_drafts where id = $1", [draft[0].id]);
    await queryAsAdmin(
      "delete from ai_usage_log where engagement_id = $1 and feature = 'rls-test'",
      [engagementId],
    );
  }
});

test("ai_drafts insert is rejected for both client tiers, not just hidden from select", async () => {
  const engagement = await queryAsRole<{ id: string }>(
    "em",
    "select id from engagements limit 1",
  );
  const engagementId = engagement[0].id;

  for (const role of ["client_contact", "client_exec"] as const) {
    await assert.rejects(
      queryAsRole(
        role,
        `insert into ai_drafts (engagement_id, kind, content, created_by_role)
         values ($1, 'status_digest', '{"text":"spoofed"}'::jsonb, $2)`,
        [engagementId, role],
      ),
      `${role} must not be able to insert into ai_drafts, not just be unable to read it back`,
    );
  }
});

test("ai_usage_log has no role-scoped insert policy — even em cannot write it directly", async () => {
  const engagement = await queryAsRole<{ id: string }>(
    "em",
    "select id from engagements limit 1",
  );
  const engagementId = engagement[0].id;

  // Writes are meant to go only through the admin connection (lib/rateLimit.ts),
  // never queryAsRole — RLS has no insert policy at all for this table, so
  // this must fail even for 'em', the otherwise-fully-trusted role.
  await assert.rejects(
    queryAsRole(
      "em",
      "insert into ai_usage_log (engagement_id, feature) values ($1, 'rls-test-direct')",
      [engagementId],
    ),
    "ai_usage_log must reject role-scoped inserts entirely (admin connection only)",
  );
});
