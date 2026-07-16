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
}

export interface Approval {
  id: string;
  document_id: string;
  status: ApprovalStatus;
  approved_by: string | null;
  requested_at: string;
  approved_at: string | null;
}

export interface DocumentRecord {
  id: string;
  engagement_id: string;
  name: string;
  storage_path: string;
  visibility: Visibility;
  uploaded_by_role: "em" | "client";
  created_at: string;
  approvals?: Approval[];
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

export type UpdateKind = "milestone" | "document" | "approval" | "pulse";

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
  | "engagement_status";

export interface AuditRow {
  id: string;
  engagement_id: string;
  document_id: string | null;
  event: AuditEvent;
  actor_role: Role;
  detail: string;
  created_at: string;
}
