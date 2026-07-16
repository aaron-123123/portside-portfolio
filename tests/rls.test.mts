// Automates the access-control claim from the README: that a client role
// cannot read a private document or the audit log, even by exact id, because
// the database itself refuses the row (RLS), not the server's UI logic.
//
// Runs read-only queries through the same queryAsRole() the app uses in
// production, against the real configured DATABASE_URL — no mutations, no
// seed data required beyond what already exists.
import assert from "node:assert/strict";
import test from "node:test";
import { queryAsRole } from "../lib/db.ts";

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
