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
            <dt>Automated proof of the boundary</dt>
            <dd>
              <code>tests/rls.test.mts</code>
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
