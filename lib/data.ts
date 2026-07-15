import { queryAsRole } from "./db";
import { getRole } from "./session";
import { deriveStatus, type EngagementStatus } from "./status";
import type {
  ActionItem,
  AuditRow,
  CheckIn,
  DocumentRecord,
  Engagement,
  Milestone,
  Update,
} from "./types";

/**
 * Read helpers used by Server Components. Every query runs through the
 * role-scoped connection (lib/db.ts), so Row Level Security — not application
 * code — decides which rows come back. A client-role viewer asking for private
 * documents simply gets none.
 */

export async function getEngagements(): Promise<Engagement[]> {
  const role = await getRole();
  return queryAsRole<Engagement>(
    role,
    "select * from engagements order by client_name asc",
  );
}

export async function getEngagement(id: string): Promise<Engagement | null> {
  const role = await getRole();
  const rows = await queryAsRole<Engagement>(
    role,
    "select * from engagements where id = $1",
    [id],
  );
  return rows[0] ?? null;
}

export async function getDocuments(
  engagementId: string,
): Promise<DocumentRecord[]> {
  const role = await getRole();
  return queryAsRole<DocumentRecord>(
    role,
    `select d.*,
            coalesce(
              json_agg(a.*) filter (where a.id is not null),
              '[]'
            ) as approvals
       from documents d
       left join approvals a on a.document_id = d.id
      where d.engagement_id = $1
      group by d.id
      order by d.created_at desc`,
    [engagementId],
  );
}

/**
 * Audit log for an engagement. RLS restricts this to the EM role; a
 * client-scoped query returns an empty list.
 */
export async function getAuditLog(engagementId: string): Promise<AuditRow[]> {
  const role = await getRole();
  return queryAsRole<AuditRow>(
    role,
    "select * from audit_log where engagement_id = $1 order by created_at desc",
    [engagementId],
  );
}

export async function getMilestones(engagementId: string): Promise<Milestone[]> {
  const role = await getRole();
  return queryAsRole<Milestone>(
    role,
    `select * from milestones
      where engagement_id = $1
      order by sort_order asc, target_date asc nulls last, created_at asc`,
    [engagementId],
  );
}

export async function getActionItems(
  engagementId: string,
): Promise<ActionItem[]> {
  const role = await getRole();
  return queryAsRole<ActionItem>(
    role,
    `select * from action_items
      where engagement_id = $1
      order by (status = 'done') asc, due_date asc nulls last, created_at asc`,
    [engagementId],
  );
}

export async function getCheckIns(engagementId: string): Promise<CheckIn[]> {
  const role = await getRole();
  return queryAsRole<CheckIn>(
    role,
    "select * from check_ins where engagement_id = $1 order by created_at desc",
    [engagementId],
  );
}

export async function getUpdates(
  engagementId: string,
  limit = 50,
): Promise<Update[]> {
  const role = await getRole();
  return queryAsRole<Update>(
    role,
    "select * from updates where engagement_id = $1 order by created_at desc limit $2",
    [engagementId, limit],
  );
}

/** Count pending approvals for an engagement (readable by every tier). */
export async function getPendingApprovalCount(
  engagementId: string,
): Promise<number> {
  const role = await getRole();
  const rows = await queryAsRole<{ n: string }>(
    role,
    "select count(*)::text as n from approvals where engagement_id = $1 and status = 'pending'",
    [engagementId],
  );
  return Number(rows[0]?.n ?? 0);
}

/** Per-engagement derived status for the roster (works for every tier). */
export async function getEngagementStatuses(): Promise<
  Record<string, EngagementStatus>
> {
  const role = await getRole();
  const rows = await queryAsRole<Milestone>(role, "select * from milestones");
  const byEngagement: Record<string, Milestone[]> = {};
  for (const m of rows) (byEngagement[m.engagement_id] ??= []).push(m);
  const out: Record<string, EngagementStatus> = {};
  for (const [id, ms] of Object.entries(byEngagement)) {
    out[id] = deriveStatus(ms);
  }
  return out;
}

/** Count documents per engagement for the roster, respecting RLS. */
export async function getDocumentCounts(): Promise<Record<string, number>> {
  const role = await getRole();
  const rows = await queryAsRole<{ engagement_id: string; n: string }>(
    role,
    "select engagement_id, count(*)::text as n from documents group by engagement_id",
  );
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.engagement_id] = Number(row.n);
  return counts;
}
