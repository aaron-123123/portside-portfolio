# Portside

**Live demo:** https://portside-portfolio.vercel.app  ·  switch between **EM**,
**Sponsor**, and **Lead** (top right) to see the access boundary in action.

A client-delivery workspace for a professional-services consultancy. Each client
engagement gets two document spaces:

- a **Private Space** — internal to the delivery team, and
- a **Shared Space** — visible to the client.

On top of that split, Portside adds **approval sign-offs** (the delivery team asks
the client to formally approve a shared document) and a timestamped **audit log**
of everything that happens.

> This is a portfolio prototype. It models the "Spaces" pattern from professional
> services-automation tools, rebuilt to look and behave like an in-house delivery
> tool rather than a generic SaaS product. The consultancy, its clients (Contoso,
> Fabrikam, Woodgrove Bank, and others — standard placeholder names, not real
> companies), and all engagement content are fictional.

## What the portal does

- **Project timeline** — milestones with status, so the client sees progress
  without having to ask. Overall health (on track / at risk / blocked) and
  % complete are derived automatically from the milestones.
- **Action Required** — a single "ball in whose court" list: pending sign-offs
  plus open action items, per side.
- **Three access tiers**, enforced by the database, not the UI:
  - **EM** (delivery team) — full workspace, manages everything.
  - **Client · Project Lead** — full shared view; approves; closes client tasks;
    comments on shared documents.
  - **Client · Sponsor** — a one-glance status summary only, with **no documents**.
- **Private / Shared documents** with real uploads, approval sign-offs, one
  comment thread per shared document (not general chat — see [Honest scope
  notes](#honest-scope-notes-the-kind-an-interviewer-will-probe)), and version
  history — re-uploading a file with the same name adds a version instead of
  an unrelated one, each with its own independent sign-off.
- **Pulse / CSAT** — completing a milestone automatically opens a 1–5 pulse for
  the client; the EM sees the running average per engagement, plus a rollup
  across every engagement (sorted worst-first) on the home page.
- **Named assignees** on team-owned milestones/action items, plus an EM-only
  **Team Workload** rollup — open items by assignee across every engagement,
  sorted busiest-first.
- **Time & budget** (EM-only, internal) — hours logged against a per-engagement
  budget, deliberately not a billing system: no rates, no invoices.
- **Automated status feed** — client-relevant events (a milestone completes, a
  document is shared) auto-append to an Updates feed. Real email push is wired
  behind an env flag (Resend); the EM sees a one-line status showing whether
  it's actually configured or the in-app feed is the only channel.
- **Engagement lifecycle** — EM creates a new engagement straight from the
  roster (no seed script needed) and can later archive a wound-down one; the
  roster defaults to active only, with an EM-only Archived tab.
- **Per-engagement branding** — an optional client logo + accent color, shown
  to every tier, applied only as decoration next to the client name — never on
  a button or status chip, so it can't compete with coral's reserved meaning.
- **Roster search** — a client-name filter appears once there are enough
  engagements to need one.
- **AI features** — a second research pass, this time asking where AI
  genuinely removes manual EM work rather than decorating the product: **Ask
  Portside** (a Q&A assistant answered ONLY from data that role's own RLS
  query returned — see below), an **AI status-digest** draft the EM reviews
  before posting, deterministic **risk flagging** with an optional AI
  one-line "why", **meeting-notes → action items** extraction (EM approves
  before anything is written), and per-document **AI summarize** (PDF text
  extraction + native image input). Every feature is one real LLM call,
  routed through OpenRouter so the model is a config change, not a code
  change; wired but inert without `OPENROUTER_API_KEY`, and capped by a
  per-engagement rate limit since this demo has no login to gate abuse
  behind.
- **Audit log** — every event, timestamped, internal to the delivery team.
- **["How this works"](https://portside-portfolio.vercel.app/how-it-works)** —
  an in-app page walking through the access-control architecture below, so the
  story travels with the demo link.

---

## The one idea worth understanding: access control is real, not a UI trick

The whole point of Portside is that a client **cannot** see the private space —
and this is enforced in two independent layers, not by hiding a button.

**Layer 1 — the server decides, the browser never holds a key.**
The browser never talks to the database directly. Every file listing and every
download goes through Portside's own server. The server reads your tier — EM,
client project lead, or client sponsor — from an **httpOnly cookie**, which
browser JavaScript cannot read or forge. There is no database key sitting in the
browser to steal or tamper with. The sponsor tier, for instance, cannot read a
single document row — enforced by RLS, so it holds even on a direct request.

**Layer 2 — the database physically refuses.**
When the server queries the database, it does so **as your role**. On every query
it drops from its privileged connection down to the unprivileged `authenticated`
role and injects your `app_role` claim (`em`, `client_contact`, or `client_exec`)
into the request:

```sql
begin;
set local role authenticated;                              -- give up superuser
select set_config('request.jwt.claims', '{"app_role":"client_contact"}', true);
<the query>                                                -- RLS filters it
commit;
```

The database's **Row Level Security (RLS)** policies read that claim and simply
will not return private-space rows to a `client` request. Even if a bug slipped
past the server layer, the database still would not hand over the row.

Put together, the demonstrable claim is:

> Open the browser dev tools, copy a private document's download link, switch to
> Client view, and paste it. You get **403 Forbidden** — because the private row
> never leaves the database for a client role. There is nothing to intercept.

That is the difference between a real access-control boundary and a filtered list.
And it isn't just a claim to go try by hand: **`tests/rls.test.mts` runs this
same check (and three others — no shared-doc access, no audit-log access) against
the live database on every push, in CI.** If a future change ever weakened the
boundary, the build goes red before it ships.

### Where each piece lives in the code

| Concern | File |
| --- | --- |
| Role stored in an httpOnly cookie | `lib/session.ts` |
| Role-scoped DB connection (`set role` + `app_role` claim) | `lib/db.ts` |
| RLS policies (the database-level lock) | `supabase/schema.sql` |
| Download check (RLS read, then sign URL) | `app/api/download/[docId]/route.ts` |
| Server-side role checks on every write | `app/actions.ts` |
| Automated proof of the boundary, run in CI | `tests/rls.test.mts` |

---

## Ask Portside: the access boundary extends to AI

Most delivery tools with an AI assistant don't say how it interacts with
their access control. Portside's answer: the same way everything else does.
`askPortsideAction` (`app/actions.ts`) answers a question by calling the
exact same role-scoped helpers (`lib/data.ts`) the engagement page itself
renders from — RLS has already filtered what those helpers return, before
the model ever sees it. A sponsor asking about documents gets an honest "none
visible to your view," not because a prompt says not to mention them, but
because `getDocuments()` is never even called for that role. The `ai_answers`
table carries its own RLS policy on top: a client tier reads only questions
asked under its own role; the EM reads every tier's history — covered by
`tests/rls.test.mts`, the same file that proves the document boundary.

## The audit log: append-only and internal

Every meaningful event is recorded with **who** (which role), **what**, and
**when**:

- a document **upload**,
- a **visibility change** (moving a document between private and shared),
- an **approval requested** and **approval granted** (including the name the
  client signed off with), and
- **milestone**, **action-item**, and **pulse** events.

Two design choices worth calling out:

1. **The log is written by the server's admin connection only** (`lib/audit.ts`).
   Neither role can write to it directly, so entries can't be forged or edited
   from the app — it behaves as an append-only trail.
2. **The log is internal.** RLS makes it readable by the EM and **invisible to the
   client** — the same boundary that protects the private space also protects the
   audit trail.

---

## Files are stored privately

Uploaded files live in a **private** Supabase Storage bucket. Nothing in it is
publicly reachable. Downloads work through **short-lived signed URLs** (60 seconds)
that the server mints only after the access check above has passed. Files persist
across reloads and new sessions, which is the point — this is real storage, not an
in-memory demo.

---

## Honest scope notes (the kind an interviewer will probe)

- **The EM / Client toggle is a demo convenience, not authentication.** A real
  deployment would put login behind this (e.g. Supabase Auth), and each user's
  real identity would set the `app_role` claim instead of a toggle. The important
  part — that the claim drives *database-enforced* access — is already real and
  would not change. The toggle just stands in for "who is logged in". A visitor
  with no cookie defaults to the **least-privileged** client view, never EM.
  This is a deliberate choice, not an oversight: the point of a public demo link
  is that anyone can explore all three tiers with one click, and a login wall
  would work against that.
- **Roles are tiers, not per-client identities.** The RLS predicates key on the
  tier (`em` / `client_contact` / `client_exec`), so within the demo any client
  session can see any engagement's shared data. A production build would add an
  engagement/user claim to the same policies — the enforcement mechanism is
  identical, only the predicate gets narrower.
- **Intentionally out of scope:** real-time collaborative editing, third-party
  file embeds, and general chat/messaging. These add complexity without adding
  to the story this prototype is meant to tell. The one comment thread per
  *shared* document is a deliberately narrow exception to that rule, not a
  reversal of it — it's scoped to a single document's sign-off conversation,
  not a messaging feature.
- **Assignees are names, not accounts.** A team member's name on an action
  item or in the workload rollup is free text, the same pattern the audit log
  and pulse responses already use — there's no user/directory table backing
  it. A real deployment would tie it to the same identity that would replace
  the EM/Client toggle.
- **Time tracking is deliberately not a billing system.** Hours logged against
  a budget, no rates, no invoices, no client visibility — an internal planning
  number, not a finance feature.
- **A client logo is a URL, not an upload.** Reusing the existing private
  Storage bucket for something purely decorative would add real plumbing for
  no functional gain; an EM-supplied image URL is the right amount of
  engineering for a branding accent.

---

## Design

**Space Mono at regular weight** carries headings, labels, and data (hierarchy
comes from size and spacing, not bold), paired with **Source Sans** for body
copy and a **serif wordmark** (Tinos) for "Portside". Warm cream `#F4F0ED` and
near-black `#22190C` carry almost everything; **coral `#FF4832` is reserved for
a genuine decision** (the client's Approve) plus the "blocked" status. Bracketed
`[ … ]` text links are the signature. Tokens live in `app/globals.css`.

## Tech stack

- **Next.js 16 (App Router)** — server components, server actions, route handlers.
- **Supabase** — Postgres (data), Storage (file bytes), Row Level Security (the
  database-level access lock).
- **node-postgres (`pg`)** — the role-scoped database connection that enforces RLS.
- **Node's built-in test runner** (`node --test`) for the RLS boundary test — no
  test framework dependency.
- **GitHub Actions** — lint + build + the RLS test run on every push and PR.
- Deployed on **Vercel**.

---

## Running it

Setup is written for someone who does not code — see **[DEPLOY.md](./DEPLOY.md)**
for exact, click-by-click steps. In short:

1. Create the database: paste `supabase/schema.sql` into the Supabase SQL Editor.
2. Copy `.env.local.example` to `.env.local` and fill in the three values (project
   URL, `service_role` key, and the transaction-pooler `DATABASE_URL`).
3. `npm install`
4. `npm run seed` — loads the sample engagements and documents.
5. `npm run dev` — open <http://localhost:3000>.
6. `npm test` — runs the automated RLS boundary check against the same database.
