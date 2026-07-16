// Shared domain types for Portside.

// Three access tiers. The two client tiers are enforced separately by the DB:
//   client_contact — project lead, full shared view
//   client_exec    — sponsor, one-glance summary only (no documents)
export type Role = "em" | "client_contact" | "client_exec";

export type Visibility = "private" | "shared";

export type ApprovalStatus = "pending" | "approved";

export type MilestoneStatus = "planned" | "in_progress" | "done" | "blocked";

export type OwnerSide = "team" | "client";

export type ActionStatus = "open" | "done";

export type EngagementLifecycle = "active" | "archived";

export interface Engagement {
  id: string;
  client_name: string;
  status: EngagementLifecycle;
  created_at: string;
  budget_hours: number | null;
  logo_url: string | null;
  accent_color: string | null;
}

export interface TimeEntry {
  id: string;
  engagement_id: string;
  logged_by: string;
  hours: number;
  note: string | null;
  logged_at: string;
  created_at: string;
}

export interface Approval {
  id: string;
  document_id: string;
  status: ApprovalStatus;
  approved_by: string | null;
  requested_at: string;
  approved_at: string | null;
}

export interface DocumentComment {
  id: string;
  document_id: string;
  engagement_id: string;
  author_role: Role;
  author_name: string;
  body: string;
  created_at: string;
}

export interface DocumentRecord {
  id: string;
  engagement_id: string;
  name: string;
  storage_path: string;
  visibility: Visibility;
  uploaded_by_role: "em" | "client";
  created_at: string;
  family_id: string;
  version: number;
  approvals?: Approval[];
  comments?: DocumentComment[];
  ai_summary?: string | null;
}

export interface DocumentVersion {
  id: string;
  name: string;
  version: number;
  visibility: Visibility;
  created_at: string;
}

export interface Milestone {
  id: string;
  engagement_id: string;
  title: string;
  detail: string | null;
  target_date: string | null;
  status: MilestoneStatus;
  sort_order: number;
  completed_at: string | null;
  created_at: string;
  assignee: string | null;
}

export interface ActionItem {
  id: string;
  engagement_id: string;
  title: string;
  owner_side: OwnerSide;
  status: ActionStatus;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
  assignee: string | null;
}

export type CheckInStatus = "pending" | "submitted";

export interface CheckIn {
  id: string;
  engagement_id: string;
  milestone_id: string | null;
  prompt: string;
  status: CheckInStatus;
  score: number | null;
  comment: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  created_at: string;
}

export type UpdateKind = "milestone" | "document" | "approval" | "pulse" | "status";

export interface Update {
  id: string;
  engagement_id: string;
  kind: UpdateKind;
  summary: string;
  created_at: string;
}

export type AuditEvent =
  | "upload"
  | "visibility_change"
  | "approval_requested"
  | "approved"
  | "milestone"
  | "action_item"
  | "pulse"
  | "engagement_status"
  | "comment"
  | "engagement_created"
  | "ai";

export interface AuditRow {
  id: string;
  engagement_id: string;
  document_id: string | null;
  event: AuditEvent;
  actor_role: Role;
  detail: string;
  created_at: string;
}

// ---------------------------------------------------------------------------
// AI features
// ---------------------------------------------------------------------------

/** One "Ask Portside" question/answer, scoped to the role that asked it. */
export interface AiAnswer {
  id: string;
  engagement_id: string;
  document_id: string | null;
  asked_by_role: Role;
  question: string;
  answer: string;
  created_at: string;
}

export type AiDraftKind = "status_digest" | "risk_flags" | "action_items";

export interface StatusDigestContent {
  text: string;
}

export interface ExtractedActionItem {
  title: string;
  assignee: string | null;
  due_date: string | null;
  owner_side: OwnerSide;
}

export interface ActionItemsDraftContent {
  items: ExtractedActionItem[];
}

export interface RiskFlagNote {
  ref: string;
  note: string;
}

export interface RiskFlagsDraftContent {
  notes: RiskFlagNote[];
}

export interface AiDraft {
  id: string;
  engagement_id: string;
  kind: AiDraftKind;
  content: StatusDigestContent | ActionItemsDraftContent | RiskFlagsDraftContent;
  created_by_role: Role;
  created_at: string;
}

/** A deterministically-detected risk signal — no AI involved in detection. */
export interface RiskSignal {
  ref: string;
  kind: "overdue_milestone" | "blocked_milestone" | "overdue_action" | "low_pulse";
  title: string;
  detail: string;
}
