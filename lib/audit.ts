import { queryAsAdmin } from "./db";
import type { AuditEvent, Role } from "./types";

/**
 * Append one row to the audit log.
 *
 * Written with the admin (RLS-bypassing) connection so the entry is recorded
 * regardless of the actor's role and cannot be tampered with by a role-scoped
 * query. The log is read-only to the EM (via RLS) and invisible to the client.
 */
export async function writeAudit(params: {
  engagementId: string;
  documentId: string | null;
  event: AuditEvent;
  actorRole: Role;
  detail: string;
}): Promise<void> {
  try {
    await queryAsAdmin(
      `insert into audit_log (engagement_id, document_id, event, actor_role, detail)
       values ($1, $2, $3, $4, $5)`,
      [
        params.engagementId,
        params.documentId,
        params.event,
        params.actorRole,
        params.detail,
      ],
    );
  } catch (err) {
    // An audit write must never be swallowed silently.
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to write audit event "${params.event}": ${message}`);
  }
}
