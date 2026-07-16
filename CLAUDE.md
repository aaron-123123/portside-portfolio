# Portside — project guide

A client-delivery portal (portfolio piece). Next.js 16 (App Router) + Supabase,
deployed on Vercel. Public repo `aaron-123123/portside-portfolio`. User-facing
setup lives in `README.md` / `DEPLOY.md`; this file is the map for editing the code.

## Commands

- `npm run dev` — local dev server (reads `.env.local`).
- `npm run build` — production build + typecheck (run before pushing).
- `npm run seed` — reset the sample data (uses `node --env-file=.env.local`;
  fixed engagement IDs, so it's idempotent).
- `npm test` — runs `tests/*.test.mts` (Node's built-in test runner) against the
  real database in `DATABASE_URL`. No mocks: it proves the RLS boundary directly,
  the same way production traffic hits it.
- `npm run lint`.
- Apply the schema: paste `supabase/schema.sql` into the Supabase SQL Editor
  (idempotent — safe to re-run; it also `ALTER`s constraints for older DBs).
- CI (`.github/workflows/ci.yml`): lint+build run on every push/PR with no
  secrets needed; the RLS test additionally needs a `DATABASE_URL` repo secret
  and is skipped (not failed) on fork PRs, which never receive secrets.

## The core idea: two-layer access control (don't break this)

Roles / tiers: **`em`** (delivery team), **`client_contact`** (client project
lead), **`client_exec`** (client sponsor).

1. **Server layer** — the tier is read from an httpOnly cookie in
   `lib/session.ts`. Default (no cookie) is `client_contact`, **never `em`**.
2. **Database layer** — ALL data access goes through direct Postgres
   (`node-pg`) in `lib/db.ts`. Each query runs:
   `begin; set local role authenticated; select set_config('request.jwt.claims', '{"app_role":…}', true); <query>; commit;`
   so **Row Level Security** in `supabase/schema.sql` enforces access per tier.
   - `queryAsRole(role, sql, params)` — RLS-enforced. Use for everything.
   - `queryAsAdmin(sql, params)` — RLS-bypassed. ONLY for the append-only
     `audit_log` and `updates` writes.
   - Parameterized queries only (the role is a bound param). No string-built SQL.

The **Supabase JS client** (`lib/supabase.ts`) is used *only* for Storage
(uploads + signed download URLs). The `service_role` key never reaches the browser.

Guarantees (verified, keep them true — and enforced by `tests/rls.test.mts` in
CI, not just this paragraph): `client_exec` reads zero documents; `client_contact`
sees only `shared` docs; clients never read `audit_log`; a private file 403s even
by exact id (`app/api/download/[docId]/route.ts` reads the row *as the role*
before signing a URL). Every mutation in `app/actions.ts` re-checks `getRole()`
server-side, AND inserts/updates *as that role* via `queryAsRole` so the RLS
`with check` clause is the real gate, not the app-layer `if`.

**Gotcha learned the hard way:** an RLS `with check` must validate every
client-controlled column it inserts, not just the "obvious" one. The first cut
of `document_comments_insert` checked the document's visibility but not that
the (denormalized) `engagement_id` column matched that document's real
engagement — a tampered hidden form field could pass. Fixed by adding an
`exists (select 1 from documents where id = document_id and engagement_id =
document_comments.engagement_id)` clause. If you add another table with a
redundant foreign key column like this, cross-check it in the policy too.

## Data model (`supabase/schema.sql`)

`engagements` (has a `status`: `active` | `archived`, EM-only to change) ·
`documents` (private/shared) · `document_comments` (one thread per *shared*
document — RLS mirrors `documents_select` exactly) · `approvals` · `milestones` ·
`action_items` · `check_ins` (pulse/CSAT) · `updates` (client status feed) ·
`audit_log`. RLS policies key on `public.app_role()` and `public.is_client()`.

## Key files

| Area | File |
| --- | --- |
| Role cookie | `lib/session.ts` |
| Role-scoped + admin Postgres | `lib/db.ts` |
| Storage client + env check | `lib/supabase.ts` |
| Read helpers (role-scoped) | `lib/data.ts` |
| Derived status (RAG + %) | `lib/status.ts` |
| Audit / status-feed writes | `lib/audit.ts`, `lib/notify.ts` |
| All mutations (server actions) | `app/actions.ts` |
| Engagement page (composed per tier) | `app/engagement/[id]/page.tsx` |
| Home / roster page | `app/page.tsx` |
| "How this works" page | `app/how-it-works/page.tsx` |
| UI components | `app/components/*` |
| Pending-state submit button (`useFormStatus`) | `app/components/SubmitButton.tsx` |
| Error / not-found boundaries | `app/error.tsx`, `app/not-found.tsx` |
| Automated RLS boundary test | `tests/rls.test.mts` |
| CI | `.github/workflows/ci.yml` |
| Schema + RLS | `supabase/schema.sql` |
| Sample data | `scripts/seed.mjs` |
| Design tokens / styles | `app/globals.css`, fonts in `app/layout.tsx` |

## Environment (`.env.local`; see `.env.local.example`)

`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
(Supabase **transaction pooler** string, port 6543). Optional email push
(inert unless all set — `lib/notify.ts` `isEmailPushConfigured()` reports the
state to EM in the Updates panel): `RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`,
`CLIENT_NOTIFY_EMAIL`. Same three (+ optional) are set in Vercel project settings.
`DATABASE_URL` is *also* set as a GitHub Actions repo secret, so CI can run
`tests/rls.test.mts` against the real database.

## Design system

- `app/globals.css` tokens: cream `#F4F0ED`, ink `#22190C`, coral `#FF4832`
  (decisions only), rust `#834A33`, muted `#6B655C` (~4.5:1 on cream, WCAG AA).
- **Space Mono at weight 400 only** for headings/labels/chips (hierarchy via
  size + spacing, never bold); **Source Sans** body; **Tinos** serif for the
  "Portside" wordmark. Fonts loaded in `app/layout.tsx`.
- Bracketed `[ LABEL ]` text links are the signature; coral is reserved to the
  Approve decision + `blocked` status + brand mark; 2px radius; pill role toggle.

## Conventions & gotchas

- **Next.js 16**: `cookies()`, `headers()`, and route `params` are **async** —
  `await` them. Pages that read the role set `export const dynamic = "force-dynamic"`.
  Read `node_modules/next/dist/docs/` before using unfamiliar App-Router APIs.
- Server actions live in `app/actions.ts` (`'use server'`); forms post directly
  to them (progressive enhancement, minimal client JS).
- **pg type parsers (`lib/db.ts`)**: `date` (OID 1082) is returned as a
  `YYYY-MM-DD` string; `timestamptz` (1184) as an ISO string. Both are otherwise
  JS `Date` objects by default — don't reintroduce that mismatch.
- `supabase/schema.sql` is idempotent; keep it that way (`create … if not exists`,
  `drop policy if exists`, `add column if not exists`, constraint drop+recreate).
- Repo is connected to Vercel — a push to `main` auto-deploys. CI runs first
  (see Commands above) but does not currently gate the Vercel deploy.
- **`lib/data.ts` `getDocuments`**: uses correlated subqueries for `approvals`
  and `comments`, not a `left join … group by`. A second one-to-many join
  (adding comments to the existing approvals join) would have fanned out and
  duplicated the approval row once per comment. If you add another related
  table to this query, use a subquery, not another join.
