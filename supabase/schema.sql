-- ============================================================================
-- Portside — database schema, Row Level Security, and storage bucket.
-- Run this ONCE in the Supabase SQL Editor (see DEPLOY.md for exact steps).
-- It is safe to re-run: every statement is idempotent.
--
-- Roles (the `app_role` claim the app injects per request):
--   em             — delivery team (sees everything, manages everything)
--   client_contact — client project lead (full shared view; approves; acts on tasks)
--   client_exec    — client sponsor (one-glance summary only; no documents)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.engagements (
  id          uuid primary key default gen_random_uuid(),
  client_name text not null,
  created_at  timestamptz not null default now()
);

-- Lifecycle state: an engagement that's wound down moves out of the default
-- roster view rather than living forever as "active" (idempotent backfill).
alter table public.engagements
  add column if not exists status text not null default 'active';

-- Per-engagement branding: a client logo + accent color, applied only as
-- decoration near the client name (never on a button, chip, or decision
-- control) — coral stays reserved to Approve/blocked, this doesn't compete
-- with that.
alter table public.engagements add column if not exists logo_url text;
alter table public.engagements add column if not exists accent_color text;

alter table public.engagements drop constraint if exists engagements_accent_color_check;
alter table public.engagements add constraint engagements_accent_color_check
  check (accent_color is null or accent_color ~ '^#[0-9a-fA-F]{6}$');

alter table public.engagements drop constraint if exists engagements_status_check;
alter table public.engagements add constraint engagements_status_check
  check (status in ('active', 'archived'));

create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  engagement_id    uuid not null references public.engagements(id) on delete cascade,
  name             text not null,
  storage_path     text not null,
  visibility       text not null check (visibility in ('private', 'shared')),
  uploaded_by_role text not null check (uploaded_by_role in ('em', 'client')),
  created_at       timestamptz not null default now()
);

-- Versioning: all versions of "the same" document share family_id (the first
-- version's own id); version increments. Re-uploading a file with the same
-- name in the same engagement adds a version instead of an unrelated row.
-- Each version keeps its own independent approvals/comments (a fresh version
-- starts its own sign-off, which is the correct real-world behavior).
alter table public.documents add column if not exists family_id uuid;
update public.documents set family_id = id where family_id is null;
alter table public.documents alter column family_id set not null;
alter table public.documents alter column family_id set default gen_random_uuid();

alter table public.documents add column if not exists version int not null default 1;

create index if not exists documents_family_idx on public.documents(family_id);

create table if not exists public.approvals (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null unique references public.documents(id) on delete cascade,
  engagement_id uuid references public.engagements(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending', 'approved')),
  approved_by   text,
  requested_at  timestamptz not null default now(),
  approved_at   timestamptz
);

-- Backfill the column for databases created before it existed (idempotent).
alter table public.approvals
  add column if not exists engagement_id uuid references public.engagements(id) on delete cascade;

-- Project timeline: the milestones a client can self-check without asking.
create table if not exists public.milestones (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  title         text not null,
  detail        text,
  target_date   date,
  status        text not null default 'planned'
                  check (status in ('planned', 'in_progress', 'done', 'blocked')),
  sort_order    int  not null default 0,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Action items: the "ball in whose court" list behind the Action Required panel.
create table if not exists public.action_items (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  title         text not null,
  owner_side    text not null check (owner_side in ('team', 'client')),
  status        text not null default 'open' check (status in ('open', 'done')),
  due_date      date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now(),
  -- Free-text team member name (mirrors approved_by/submitted_by elsewhere —
  -- no user/account table exists in this demo). Only meaningful for
  -- owner_side = 'team'; drives the cross-engagement workload rollup.
  assignee      text
);

alter table public.action_items add column if not exists assignee text;

-- Milestones get the same free-text assignee, for the same reason.
alter table public.milestones add column if not exists assignee text;

-- Pulse / CSAT: a quick satisfaction check the client answers when a milestone
-- is completed. One per milestone.
create table if not exists public.check_ins (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  milestone_id  uuid unique references public.milestones(id) on delete cascade,
  prompt        text not null,
  status        text not null default 'pending' check (status in ('pending', 'submitted')),
  score         int  check (score between 1 and 5),
  comment       text,
  submitted_by  text,
  submitted_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- Budgeted hours per engagement — an internal (EM-only) planning figure, not
-- shown to either client tier.
alter table public.engagements add column if not exists budget_hours numeric;

-- Light time tracking, deliberately not a billing system: no rates, no
-- invoices, just hours logged against an engagement vs. its budget.
-- Internal only — same visibility boundary as the audit log.
create table if not exists public.time_entries (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  logged_by     text not null,
  hours         numeric not null check (hours > 0),
  note          text,
  logged_at     date not null default current_date,
  created_at    timestamptz not null default now()
);

create index if not exists time_entries_engagement_idx
  on public.time_entries(engagement_id);

-- Client-facing status feed. Rows are appended automatically by the server when
-- client-relevant things happen (a milestone completes, a document is shared).
create table if not exists public.updates (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  kind          text not null check (kind in ('milestone', 'document', 'approval', 'pulse')),
  summary       text not null,
  created_at    timestamptz not null default now()
);

-- One comment thread per document (not general chat) — scoped narrowly on
-- purpose. Visible to whoever can already see the document; the sponsor
-- tier sees no documents at all, so it sees no comments either.
create table if not exists public.document_comments (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.documents(id) on delete cascade,
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  author_role   text not null check (author_role in ('em', 'client_contact', 'client_exec')),
  author_name   text not null,
  body          text not null,
  created_at    timestamptz not null default now()
);

create index if not exists document_comments_document_idx
  on public.document_comments(document_id);

create table if not exists public.audit_log (
  id            uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.engagements(id) on delete cascade,
  document_id   uuid references public.documents(id) on delete set null,
  event         text not null check (event in ('upload', 'visibility_change', 'approval_requested', 'approved', 'milestone', 'action_item', 'pulse', 'engagement_status', 'comment', 'engagement_created')),
  actor_role    text not null check (actor_role in ('em', 'client_contact', 'client_exec')),
  detail        text not null,
  created_at    timestamptz not null default now()
);

create index if not exists documents_engagement_idx  on public.documents(engagement_id);
create index if not exists milestones_engagement_idx on public.milestones(engagement_id);
create index if not exists actions_engagement_idx    on public.action_items(engagement_id);
create index if not exists checkins_engagement_idx   on public.check_ins(engagement_id);
create index if not exists updates_engagement_idx     on public.updates(engagement_id);
create index if not exists audit_engagement_idx      on public.audit_log(engagement_id);

-- Upgrade audit_log CHECK constraints for databases created before milestones,
-- action items, pulse, and the split client roles existed (idempotent).
alter table public.audit_log drop constraint if exists audit_log_event_check;
alter table public.audit_log add constraint audit_log_event_check
  check (event in ('upload', 'visibility_change', 'approval_requested', 'approved', 'milestone', 'action_item', 'pulse', 'engagement_status', 'comment', 'engagement_created'));

alter table public.audit_log drop constraint if exists audit_log_actor_role_check;
alter table public.audit_log add constraint audit_log_actor_role_check
  check (actor_role in ('em', 'client_contact', 'client_exec'));

-- ---------------------------------------------------------------------------
-- Helpers: read the custom claims the app signs into each request.
-- ---------------------------------------------------------------------------

create or replace function public.app_role() returns text
language sql stable
as $$
  select coalesce(
    current_setting('request.jwt.claims', true)::jsonb ->> 'app_role',
    ''
  );
$$;

-- True for either client tier (sponsor or project lead).
create or replace function public.is_client() returns boolean
language sql stable
as $$
  select public.app_role() in ('client_contact', 'client_exec');
$$;

grant execute on function public.app_role(), public.is_client() to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Table privileges for the `authenticated` role. RLS below is the real gate.
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated;
grant select, insert, update on public.engagements  to authenticated;
grant select, insert, update on public.documents    to authenticated;
grant select, insert, update on public.approvals    to authenticated;
grant select, insert, update on public.milestones   to authenticated;
grant select, insert, update on public.action_items to authenticated;
grant select, insert, update on public.check_ins    to authenticated;
grant select                 on public.updates      to authenticated;
grant select                 on public.audit_log    to authenticated;
grant select, insert         on public.document_comments to authenticated;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.engagements  enable row level security;
alter table public.documents    enable row level security;
alter table public.approvals    enable row level security;
alter table public.milestones   enable row level security;
alter table public.action_items enable row level security;
alter table public.check_ins    enable row level security;
alter table public.updates      enable row level security;
alter table public.audit_log    enable row level security;
alter table public.document_comments enable row level security;

-- Engagements: any signed-in viewer may list them; only EM changes lifecycle status.
drop policy if exists engagements_select on public.engagements;
create policy engagements_select on public.engagements
  for select to authenticated
  using (true);

drop policy if exists engagements_update on public.engagements;
create policy engagements_update on public.engagements
  for update to authenticated
  using (public.app_role() = 'em')
  with check (public.app_role() = 'em');

drop policy if exists engagements_insert on public.engagements;
create policy engagements_insert on public.engagements
  for insert to authenticated
  with check (public.app_role() = 'em');

-- Documents: EM sees all; the project lead sees shared docs; the sponsor (exec)
-- sees NO documents — a genuine third access tier, enforced by the database.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using (
    public.app_role() = 'em'
    or (visibility = 'shared' and public.app_role() = 'client_contact')
  );

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents
  for insert to authenticated
  with check (public.app_role() = 'em');

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents
  for update to authenticated
  using (public.app_role() = 'em')
  with check (public.app_role() = 'em');

-- Document comments: visible/postable only to whoever can already see the
-- document (em sees all; client_contact only on shared docs). The sponsor
-- tier sees no documents, so it can neither read nor write here.
drop policy if exists document_comments_select on public.document_comments;
create policy document_comments_select on public.document_comments
  for select to authenticated
  using (
    public.app_role() = 'em'
    or (
      public.app_role() = 'client_contact'
      and exists (
        select 1 from public.documents d
         where d.id = document_comments.document_id
           and d.visibility = 'shared'
      )
    )
  );

-- The engagement_id column is denormalized (document_id alone would derive
-- it), so require it to actually match the document's row — otherwise a
-- tampered hidden form field could land a comment's audit trail under the
-- wrong engagement even though the comment itself stays correctly scoped.
drop policy if exists document_comments_insert on public.document_comments;
create policy document_comments_insert on public.document_comments
  for insert to authenticated
  with check (
    exists (
      select 1 from public.documents d
       where d.id = document_comments.document_id
         and d.engagement_id = document_comments.engagement_id
    )
    and (
      public.app_role() = 'em'
      or (
        public.app_role() = 'client_contact'
        and exists (
          select 1 from public.documents d
           where d.id = document_comments.document_id
             and d.visibility = 'shared'
        )
      )
    )
  );

-- Approvals: readable by all; only EM requests; only the project lead grants.
drop policy if exists approvals_select on public.approvals;
create policy approvals_select on public.approvals
  for select to authenticated
  using (true);

drop policy if exists approvals_insert on public.approvals;
create policy approvals_insert on public.approvals
  for insert to authenticated
  with check (public.app_role() = 'em');

drop policy if exists approvals_update on public.approvals;
create policy approvals_update on public.approvals
  for update to authenticated
  using (public.app_role() = 'client_contact')
  with check (public.app_role() = 'client_contact');

-- Milestones: everyone sees the timeline; only EM manages it.
drop policy if exists milestones_select on public.milestones;
create policy milestones_select on public.milestones
  for select to authenticated
  using (true);

drop policy if exists milestones_insert on public.milestones;
create policy milestones_insert on public.milestones
  for insert to authenticated
  with check (public.app_role() = 'em');

drop policy if exists milestones_update on public.milestones;
create policy milestones_update on public.milestones
  for update to authenticated
  using (public.app_role() = 'em')
  with check (public.app_role() = 'em');

-- Action items: everyone sees them; EM manages any; the project lead may close
-- items that belong to the client side.
drop policy if exists action_items_select on public.action_items;
create policy action_items_select on public.action_items
  for select to authenticated
  using (true);

drop policy if exists action_items_insert on public.action_items;
create policy action_items_insert on public.action_items
  for insert to authenticated
  with check (public.app_role() = 'em');

drop policy if exists action_items_update on public.action_items;
create policy action_items_update on public.action_items
  for update to authenticated
  using (
    public.app_role() = 'em'
    or (public.app_role() = 'client_contact' and owner_side = 'client')
  )
  with check (
    public.app_role() = 'em'
    or (public.app_role() = 'client_contact' and owner_side = 'client')
  );

-- Pulse / CSAT: everyone sees it; only EM opens one (on milestone completion);
-- only a client tier submits the response.
drop policy if exists check_ins_select on public.check_ins;
create policy check_ins_select on public.check_ins
  for select to authenticated
  using (true);

drop policy if exists check_ins_insert on public.check_ins;
create policy check_ins_insert on public.check_ins
  for insert to authenticated
  with check (public.app_role() = 'em');

drop policy if exists check_ins_update on public.check_ins;
create policy check_ins_update on public.check_ins
  for update to authenticated
  using (public.is_client())
  with check (public.is_client());

-- Updates feed: client-facing, readable by everyone. Rows are appended by the
-- server's admin connection (RLS bypassed), so no insert policy is needed.
drop policy if exists updates_select on public.updates;
create policy updates_select on public.updates
  for select to authenticated
  using (true);

-- Audit log: internal. EM reads it; clients cannot see it. Writes are done by
-- the server's admin connection (RLS bypassed), so no insert policy is needed.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log
  for select to authenticated
  using (public.app_role() = 'em');

-- Time entries: internal only, same boundary as the audit log. Neither
-- client tier can read or write hours logged against the budget.
alter table public.time_entries enable row level security;

drop policy if exists time_entries_select on public.time_entries;
create policy time_entries_select on public.time_entries
  for select to authenticated
  using (public.app_role() = 'em');

drop policy if exists time_entries_insert on public.time_entries;
create policy time_entries_insert on public.time_entries
  for insert to authenticated
  with check (public.app_role() = 'em');

grant select, insert on public.time_entries to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: one PRIVATE bucket. Files are reached only through short-lived
-- signed URLs minted server-side after the access check above passes.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;
