import Link from "next/link";

export const metadata = {
  title: "How this works — Portside",
};

export default function HowItWorks() {
  return (
    <main className="container">
      <Link href="/" className="back-link">
        ← All engagements
      </Link>
      <p className="eyebrow">Portside / Access control</p>
      <h1 className="page-title">How the private space stays private</h1>
      <p className="lede">
        A client can never see the delivery team&apos;s private documents —
        not because a button is hidden, but because the database itself
        refuses to hand the row over. Two independent layers make that true.
      </p>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Layer 1 — the server decides</h2>
          <span className="section-note">Your browser never holds a key</span>
        </div>
        <p>
          Every file listing and download goes through Portside&apos;s own
          server — the browser never talks to the database directly. The
          server reads your tier (EM, project lead, or sponsor) from an{" "}
          <code>httpOnly</code> cookie, which browser JavaScript cannot read
          or forge. A visitor with no cookie defaults to the{" "}
          <strong>least-privileged</strong> client view, never EM.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">
            Layer 2 — the database physically refuses
          </h2>
          <span className="section-note">Row Level Security</span>
        </div>
        <p>
          On every query, the server drops from its privileged connection
          down to an unprivileged role and tells the database which tier is
          asking:
        </p>
        <p>
          <code>set local role authenticated;</code>
          <br />
          <code>select set_config(&apos;request.jwt.claims&apos;, claim, true);</code>
          <br />
          <code>-- the query, filtered by Row Level Security policy</code>
        </p>
        <p>
          The database&apos;s Row Level Security policies read that claim and
          simply will not return private-space rows to a client request —
          even if a bug slipped past the server layer, the database still
          would not hand over the row.
        </p>
      </section>

      <div className="callout-box">
        <p>
          <strong>The demonstrable claim: </strong>switch to a client view,
          copy a private document&apos;s download link, and open it. You get{" "}
          <strong>403 Forbidden</strong> — because the private row never
          leaves the database for a client role. There is nothing to
          intercept.
        </p>
        <p>
          This isn&apos;t just a claim in this paragraph — it&apos;s an
          automated test (<code>tests/rls.test.mts</code>) that runs against
          the real database on every push, in CI.
        </p>
      </div>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">The AI layer is RLS-scoped too</h2>
          <span className="section-note">Ask Portside</span>
        </div>
        <p>
          Most delivery tools with an AI assistant never say how it interacts
          with their access boundary. Portside&apos;s answer is: the same way
          everything else does. &quot;Ask Portside&quot; answers a question by
          calling the exact same role-scoped data helpers the page itself
          renders from (<code>lib/data.ts</code>) — the same functions RLS
          already filters for the document list, the timeline, the audit log.
          Whatever those helpers didn&apos;t return, the model never saw and
          cannot mention.
        </p>
        <p>
          A client sponsor asking &quot;what documents are in this
          engagement?&quot; gets an honest &quot;none visible to your
          view&quot; — not because a prompt says <em>don&apos;t mention
          documents</em>, but because <code>getDocuments()</code> was never
          even called for that role (see the engagement page and{" "}
          <code>askPortsideAction</code> in <code>app/actions.ts</code>).
          Ask the same question as the EM or the project lead and the answer
          is grounded in the real document list, because that role&apos;s
          query actually returned one. The <code>ai_answers</code> table
          carries its own RLS policy on top — a client tier can only ever
          read questions asked under its own role; only the EM sees every
          tier&apos;s history — enforced the same way as everything else in
          this app, and covered by <code>tests/rls.test.mts</code>.
        </p>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Where each piece lives</h2>
          <span className="section-note">In the code</span>
        </div>
        <dl className="kv-list">
          <div className="kv-row">
            <dt>Role stored in an httpOnly cookie</dt>
            <dd>
              <code>lib/session.ts</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Role-scoped database connection</dt>
            <dd>
              <code>lib/db.ts</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Row Level Security policies</dt>
            <dd>
              <code>supabase/schema.sql</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Download check (RLS read, then a signed URL)</dt>
            <dd>
              <code>app/api/download/[docId]/route.ts</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>RLS-scoped AI answer (Ask Portside)</dt>
            <dd>
              <code>askPortsideAction</code> in <code>app/actions.ts</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Automated proof of the boundary</dt>
            <dd>
              <code>tests/rls.test.mts</code>
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Beyond access control</h2>
          <span className="section-note">Delivery-depth features</span>
        </div>
        <p>
          The access-control story above is the point of the demo, but
          Portside also models the parts of running a real engagement that
          Rocketlane and similar delivery tools treat as core: creating a new
          engagement from the product itself (not a seed script), named
          assignees on team-owned work with a cross-engagement workload
          rollup, document versioning (a same-named re-upload adds a version,
          not an unrelated file), lightweight time &amp; budget tracking
          (internal only, deliberately not a billing system), and an optional
          client logo / accent color — applied only as decoration, never on a
          button or status chip, so it can&apos;t compete with coral&apos;s
          reserved meaning.
        </p>
        <dl className="kv-list">
          <div className="kv-row">
            <dt>Engagement creation</dt>
            <dd>
              <code>createEngagementAction</code> in <code>app/actions.ts</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Assignees &amp; workload rollup</dt>
            <dd>
              <code>app/components/WorkloadOverview.tsx</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Document versioning</dt>
            <dd>
              <code>documents.family_id</code> / <code>.version</code> in{" "}
              <code>supabase/schema.sql</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Time &amp; budget (internal only)</dt>
            <dd>
              <code>app/components/TimeBudget.tsx</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Per-engagement branding</dt>
            <dd>
              <code>engagements.logo_url</code> / <code>.accent_color</code>
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">AI-native, not AI-decoration</h2>
          <span className="section-note">Second research pass</span>
        </div>
        <p>
          A second research pass looked at Rocketlane&apos;s Nitro AI agents
          and comparable tools, this time asking where AI genuinely removes
          manual work for an engagement manager — not where it&apos;s a
          gimmick. Every feature below is one real LLM call, routed through
          OpenRouter so the model is a config change, not a code change (see{" "}
          <code>lib/ai.ts</code>), stays fully wired but inert without{" "}
          <code>OPENROUTER_API_KEY</code> configured (mirrors the email-push
          pattern in <code>lib/notify.ts</code>), and is capped by a
          per-engagement rate limit (<code>lib/rateLimit.ts</code>) since this
          demo has no login to gate abuse behind.
        </p>
        <dl className="kv-list">
          <div className="kv-row">
            <dt>Ask Portside — RLS-scoped Q&amp;A</dt>
            <dd>
              <code>askPortsideAction</code> · every tier
            </dd>
          </div>
          <div className="kv-row">
            <dt>AI status-digest generator</dt>
            <dd>
              <code>app/components/StatusDigest.tsx</code> · EM drafts, reviews,
              then posts
            </dd>
          </div>
          <div className="kv-row">
            <dt>Deterministic risk flagging + AI &quot;why&quot;</dt>
            <dd>
              <code>lib/risk.ts</code> (no AI needed) +{" "}
              <code>app/components/RiskPanel.tsx</code>
            </dd>
          </div>
          <div className="kv-row">
            <dt>Meeting notes → structured action items</dt>
            <dd>
              <code>app/components/MeetingNotesExtractor.tsx</code> · EM
              approves before anything is written
            </dd>
          </div>
          <div className="kv-row">
            <dt>Per-document AI summarize</dt>
            <dd>
              <code>summarizeDocumentAction</code> · PDF text extraction
              (<code>lib/pdf.ts</code>) + native image input
            </dd>
          </div>
        </dl>
      </section>

      <section className="section">
        <div className="section-head">
          <h2 className="section-title">What&apos;s a demo convenience</h2>
          <span className="section-note">Honest scope</span>
        </div>
        <p>
          The EM / Sponsor / Lead switch in the header is a stand-in for
          logging in, not authentication — it exists so anyone can explore
          all three tiers without an account. In a real deployment, each
          person&apos;s own login would set the same role claim this toggle
          sets today. The enforcement mechanism above — the part that
          actually matters — would not change.
        </p>
        <p>
          Similarly, roles here are tiers, not per-client identities: any
          client session can see any engagement&apos;s shared data. A
          production build would add an engagement-scoped claim to the same
          policies — narrowing the predicate, not changing how it&apos;s
          enforced.
        </p>
      </section>
    </main>
  );
}
