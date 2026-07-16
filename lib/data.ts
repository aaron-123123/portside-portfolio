import { queryAsRole } from "./db";
import { getRole } from "./session";
import { deriveStatus, type EngagementStatus } from "./status";
import type {
  ActionItem,
  AuditRow,
  CheckIn,
  DocumentRecord,
  DocumentVersion,
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

export async function getEngagements(
  filter: "active" | "archived" | "all" = "active",
): Promise<Engagement[]> {
  const role = await getRole();
  if (filter === "all") {
    return queryAsRole<Engagement>(
      role,
      "select * from engagements order by client_name asc",
    );
  }
  return queryAsRole<Engagement>(
    role,
    "select * from engagements where status = $1 order by client_name asc",
    [filter],
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
  // Correlated subqueries (not a join + group by) so a document's comments
  // and its approval never fan out and duplicate each other.
  return queryAsRole<DocumentRecord>(
    role,
    `select d.*,
            coalesce(
              (select json_agg(a.*) from approvals a where a.document_id = d.id),
              '[]'
            ) as approvals,
            coalesce(
              (select json_agg(c.* order by c.created_at asc)
                 from document_comments c
                where c.document_id = d.id),
              '[]'
            ) as comments
       from documents d
      where d.engagement_id = $1
        and d.version = (
          select max(d2.version) from documents d2 where d2.family_id = d.family_id
        )
      order by d.created_at desc`,
    [engagementId],
  );
}

/** Older versions of a document (latest is already in getDocuments), oldest first. */
export async function getDocumentVersions(
  familyId: string,
  currentVersion: number,
): Promise<DocumentVersion[]> {
  const role = await getRole();
  return queryAsRole<DocumentVersion>(
    role,
    `select id, name, version, visibility, created_at
       from documents
      where family_id = $1 and version < $2
      order by version asc`,
    [familyId, currentVersion],
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

export interface CsatByEngagement {
  engagementId: string;
  clientName: string;
  average: number;
  count: number;
}

export interface CsatOverview {
  overallAverage: number | null;
  totalResponses: number;
  byEngagement: CsatByEngagement[];
}

/**
 * Roll up submitted pulse scores across every engagement — the per-engagement
 * average (lib/status.ts) already exists, but nothing today shows an EM
 * whether satisfaction is trending well across the whole practice at a glance.
 */
export async function getCsatOverview(): Promise<CsatOverview> {
  const role = await getRole();
  const rows = await queryAsRole<{
    engagement_id: string;
    client_name: string;
    score: number;
  }>(
    role,
    `select c.engagement_id, e.client_name, c.score
       from check_ins c
       join engagements e on e.id = c.engagement_id
      where c.status = 'submitted' and c.score is not null`,
  );

  const byId = new Map<string, { clientName: string; scores: number[] }>();
  for (const row of rows) {
    const entry = byId.get(row.engagement_id) ?? {
      clientName: row.client_name,
      scores: [],
    };
    entry.scores.push(row.score);
    byId.set(row.engagement_id, entry);
  }

  const byEngagement: CsatByEngagement[] = Array.from(byId.entries())
    .map(([engagementId, { clientName, scores }]) => ({
      engagementId,
      clientName,
      count: scores.length,
      average: scores.reduce((sum, s) => sum + s, 0) / scores.length,
    }))
    .sort((a, b) => a.average - b.average);

  const allScores = rows.map((r) => r.score);
  const overallAverage =
    allScores.length === 0
      ? null
      : allScores.reduce((sum, s) => sum + s, 0) / allScores.length;

  return { overallAverage, totalResponses: allScores.length, byEngagement };
}

export interface AssigneeWorkload {
  assignee: string;
  openCount: number;
  overdueCount: number;
  items: { clientName: string; title: string; dueDate: string | null }[];
}

/**
 * Cross-engagement workload: open, team-owned action items grouped by
 * assignee, sorted busiest-first — mirrors getCsatOverview's shape so an EM
 * can spot who's overloaded the same way they spot a CSAT dip.
 */
export async function getWorkloadOverview(): Promise<AssigneeWorkload[]> {
  const role = await getRole();
  const rows = await queryAsRole<{
    assignee: string;
    client_name: string;
    title: string;
    due_date: string | null;
  }>(
    role,
    `select a.assignee, e.client_name, a.title, a.due_date
       from action_items a
       join engagements e on e.id = a.engagement_id
      where a.status = 'open' and a.owner_side = 'team' and a.assignee is not null`,
  );

  const today = new Date().toISOString().slice(0, 10);
  const byAssignee = new Map<string, AssigneeWorkload>();
  for (const row of rows) {
    const entry = byAssignee.get(row.assignee) ?? {
      assignee: row.assignee,
      openCount: 0,
      overdueCount: 0,
      items: [],
    };
    entry.openCount += 1;
    if (row.due_date && row.due_date < today) entry.overdueCount += 1;
    entry.items.push({
      clientName: row.client_name,
      title: row.title,
      dueDate: row.due_date,
    });
    byAssignee.set(row.assignee, entry);
  }

  return Array.from(byAssignee.values()).sort(
    (a, b) => b.openCount - a.openCount,
  );
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
