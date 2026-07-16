import { submitPulseAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { formatTimestamp } from "@/lib/format";
import type { CheckIn, Role } from "@/lib/types";

/**
 * Milestone-triggered pulse / CSAT.
 *   client tiers — answer any pending pulse (1–5 + optional comment).
 *   EM           — see the CSAT: average, response count, and each response.
 */
export function Pulse({
  checkIns,
  role,
  engagementId,
}: {
  checkIns: CheckIn[];
  role: Role;
  engagementId: string;
}) {
  const submitted = checkIns.filter(
    (c) => c.status === "submitted" && c.score != null,
  );
  const pending = checkIns.filter((c) => c.status === "pending");

  if (role === "em") {
    const avg =
      submitted.length > 0
        ? submitted.reduce((sum, c) => sum + (c.score ?? 0), 0) /
          submitted.length
        : null;
    return (
      <section className="section">
        <div className="section-head">
          <h2 className="section-title">Client Pulse</h2>
          <span className="section-note">Satisfaction (CSAT)</span>
        </div>
        <div className="pulse-summary">
          <div className="stat">
            <span className="stat-label">Average</span>
            <span className="stat-value">
              {avg != null ? avg.toFixed(1) : "—"}
              <span className="pulse-outof">/5</span>
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Responses</span>
            <span className="stat-value">{submitted.length}</span>
          </div>
          <div className="stat">
            <span className="stat-label">Awaiting</span>
            <span className="stat-value">{pending.length}</span>
          </div>
        </div>
        {submitted.length === 0 ? (
          <p className="empty">No pulse responses yet.</p>
        ) : (
          submitted.map((c) => (
            <div className="doc-row" key={c.id}>
              <div className="doc-main">
                <span className="item-name">{c.prompt}</span>
                <div className="doc-meta">
                  {c.submitted_by}
                  {c.submitted_at && ` · ${formatTimestamp(c.submitted_at)}`}
                  {c.comment && ` · “${c.comment}”`}
                </div>
              </div>
              <span className="chip chip--score">{c.score}/5</span>
            </div>
          ))
        )}
      </section>
    );
  }

  // Client tiers
  const last = submitted[0];
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Pulse Check</h2>
        <span className="section-note">Your feedback</span>
      </div>

      {pending.length === 0 ? (
        <p className="empty">No pulse to answer right now.</p>
      ) : (
        pending.map((ci) => (
          <form action={submitPulseAction} className="panel" key={ci.id}>
            <fieldset className="pulse-fieldset">
              <legend className="pulse-prompt">{ci.prompt}</legend>
              <div className="pulse-scale">
                {[1, 2, 3, 4, 5].map((n) => (
                  <label className="pulse-opt" key={n}>
                    <input type="radio" name="score" value={n} required />
                    <span>{n}</span>
                  </label>
                ))}
              </div>
              <div className="pulse-scale-caption">
                <span>Poor</span>
                <span>Excellent</span>
              </div>
            </fieldset>
            <div className="field-row" style={{ marginTop: 14 }}>
              <div className="field" style={{ flex: "1 1 200px" }}>
                <label htmlFor={`c-${ci.id}`}>Comment (optional)</label>
                <input id={`c-${ci.id}`} type="text" name="comment" />
              </div>
              <div className="field">
                <label htmlFor={`n-${ci.id}`}>Your name</label>
                <input
                  id={`n-${ci.id}`}
                  type="text"
                  name="submittedBy"
                  placeholder="Optional"
                />
              </div>
              <input type="hidden" name="checkInId" value={ci.id} />
              <input type="hidden" name="engagementId" value={engagementId} />
              <SubmitButton className="btn" pendingText="Submitting…">
                Submit pulse
              </SubmitButton>
            </div>
          </form>
        ))
      )}

      {last && (
        <p className="notice">
          Your last pulse: {last.score}/5
          {last.comment && ` — “${last.comment}”`}
        </p>
      )}
    </section>
  );
}
