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

`engagements` (has a `status`: `active` | `archived`, EM-only to change; also
`budget_hours`, `logo_url`, `accent_color` — all EM-only to set, the latter two
readable by every tier since they're just decoration) · `documents` (private/
shared, versioned — see below) · `document_comments` (one thread per *shared*
document — RLS mirrors `documents_select` exactly) · `approvals` · `milestones`
· `action_items` (both have a free-text `assignee`, only meaningful when
`owner_side = 'team'`) · `check_ins` (pulse/CSAT) · `updates` (client status
feed, `kind` includes `'status'` for AI-drafted posts) · `time_entries`
(internal only — same RLS boundary as `audit_log`) · `audit_log` (`event`
includes `'ai'`) · `ai_answers` (Ask Portside Q&A — see below) · `ai_drafts`
(EM-only staging for status digests / risk-flag notes / extracted action
items, `content` is `jsonb`) · `ai_usage_log` (per-engagement AI rate-limit
counter, admin-write only, same pattern as `audit_log`). RLS policies key on
`public.app_role()` and `public.is_client()`.

### AI features (`lib/ai.ts`, `lib/pdf.ts`, `lib/rateLimit.ts`, `lib/risk.ts`)

Every AI action reuses the SAME role-scoped `lib/data.ts` helpers the page
renders from, so whatever context reaches the model has already been
filtered by RLS — this is the whole point of "Ask Portside" (see the README
section of the same name). `lib/ai.ts` wraps the `openai` SDK pointed at
OpenRouter's endpoint (an OpenAI-compatible gateway, not any one provider
directly) — model is `deepseek/deepseek-v3.2` by default, override with
`OPENROUTER_MODEL` to any OpenRouter model slug (e.g.
`anthropic/claude-3.5-haiku`) without touching code. `isAiConfigured()`
mirrors `isEmailPushConfigured()` in `lib/notify.ts` — every AI panel stays
visible but inert without `OPENROUTER_API_KEY`, never errors. PDFs are
text-extracted via `lib/pdf.ts` (`pdf-parse`) rather than sent as raw bytes,
since native PDF understanding isn't a guaranteed capability across
arbitrary OpenRouter models — this trades away layout/image understanding
inside the PDF for working reliably regardless of which model is configured.
`lib/rateLimit.ts`'s `checkAiRateLimit()` caps calls per engagement
per hour (20, shared across all 5 features) via `ai_usage_log` — this demo
has no login, so nothing else stops a visitor from mashing an AI button.
`lib/risk.ts`'s `computeRiskSignals()` is pure/deterministic (no AI, no DB,
no cost) — the AI layer only adds an optional one-line "why" on top, via
`analyzeRisksAction`. `ai_answers.document_id` (nullable) is a denormalized
reference — like `document_comments.engagement_id`, its RLS insert policy
cross-checks it actually matches a document the asking role can see (same
lesson as the gotcha below).

**Document versioning:** `documents.family_id` + `.version` — all versions of
"the same" document share `family_id` (an independently generated UUID, not
necessarily equal to any version's own `id`); re-uploading a file with the
same `name` as the current-latest document in that engagement adds a version
in the same family instead of an unrelated row (`uploadDocumentAction` in
`app/actions.ts`). `getDocuments` only surfaces the latest version per family
(`lib/data.ts`); `getDocumentVersions` fetches the rest for history. Each
version keeps its own independent approvals/comments — a fresh version starts
its own sign-off, which is correct, not a gap.

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
| Cross-engagement workload rollup (by assignee) | `app/components/WorkloadOverview.tsx` |
| Time & budget (EM-only, internal) | `app/components/TimeBudget.tsx` |
| LLM wrapper (OpenRouter, model, config check) | `lib/ai.ts` |
| PDF text extraction | `lib/pdf.ts` |
| Per-engagement AI rate limit | `lib/rateLimit.ts` |
| Deterministic risk-signal detection | `lib/risk.ts` |
| Ask Portside (RLS-scoped Q&A, every tier) | `app/components/AskPortside.tsx`, `askPortsideAction` |
| AI status digest (EM drafts, reviews, posts) | `app/components/StatusDigest.tsx` |
| Risk panel (deterministic + optional AI note) | `app/components/RiskPanel.tsx` |
| Meeting notes → action items | `app/components/MeetingNotesExtractor.tsx` |
| Per-document AI summarize | `summarizeDocumentAction` in `app/actions.ts` |
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
`CLIENT_NOTIFY_EMAIL`. Optional AI features (inert unless set —
`lib/ai.ts` `isAiConfigured()`): `OPENROUTER_API_KEY`, and an optional
`OPENROUTER_MODEL` override (any OpenRouter model slug; defaults to
`deepseek/deepseek-v3.2`). Same vars are set in Vercel project settings.
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
  `YYYY-MM-DD` string; `timestamptz` (1184) as an ISO string. `numeric` (1700 —
  `budget_hours`, `time_entries.hours`) as a JS `number` via `parseFloat`. All
  three are otherwise pg defaults (JS `Date` objects, or a string for numeric)
  that would silently break call sites expecting the declared TS type — don't
  reintroduce that mismatch, and add a parser here for any future numeric
  column before doing arithmetic on it.
- `supabase/schema.sql` is idempotent; keep it that way (`create … if not exists`,
  `drop policy if exists`, `add column if not exists`, constraint drop+recreate).
- Repo is connected to Vercel — a push to `main` auto-deploys. CI runs first
  (see Commands above) but does not currently gate the Vercel deploy.
- **`lib/data.ts` `getDocuments`**: uses correlated subqueries for `approvals`
  and `comments`, not a `left join … group by`. A second one-to-many join
  (adding comments to the existing approvals join) would have fanned out and
  duplicated the approval row once per comment. If you add another related
  table to this query, use a subquery, not another join.
