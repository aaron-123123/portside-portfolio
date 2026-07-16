import { logTimeAction, setEngagementBudgetAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { formatTimestamp } from "@/lib/format";
import type { TimeEntry } from "@/lib/types";

function formatDate(date: string): string {
  return formatTimestamp(`${date}T00:00:00Z`).replace(" 00:00 UTC", "");
}

/**
 * EM-only, internal. Deliberately not a billing system — no rates, no
 * invoices, just hours logged against a budget. Same visibility boundary as
 * the audit log: neither client tier ever sees this section.
 */
export function TimeBudget({
  engagementId,
  budgetHours,
  entries,
}: {
  engagementId: string;
  budgetHours: number | null;
  entries: TimeEntry[];
}) {
  const logged = entries.reduce((sum, e) => sum + e.hours, 0);
  const percent =
    budgetHours && budgetHours > 0
      ? Math.round((logged / budgetHours) * 100)
      : null;
  const overBudget = percent !== null && percent > 100;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Time &amp; Budget</h2>
        <span className="section-note">Internal only</span>
      </div>

      <div className="pulse-summary" style={{ marginBottom: 16 }}>
        <div className="stat">
          <span className="stat-label">Budgeted</span>
          <span className="stat-value">
            {budgetHours ?? "—"}
            {budgetHours != null && <span className="pulse-outof">hrs</span>}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Logged</span>
          <span className="stat-value">
            {logged}
            <span className="pulse-outof">hrs</span>
          </span>
        </div>
        {percent !== null && (
          <div className="stat">
            <span className="stat-label">Used</span>
            <span
              className="stat-value"
              style={overBudget ? { color: "var(--coral)" } : undefined}
            >
              {percent}%
            </span>
          </div>
        )}
      </div>

      {budgetHours != null && (
        <div className="progress" aria-hidden="true">
          <div
            className="progress-fill"
            style={{
              width: `${Math.min(percent ?? 0, 100)}%`,
              background: overBudget ? "var(--coral)" : undefined,
            }}
          />
        </div>
      )}

      <form
        action={setEngagementBudgetAction}
        className="inline-form"
        style={{ marginBottom: 20 }}
      >
        <input type="hidden" name="engagementId" value={engagementId} />
        <label htmlFor="budget-hours" className="sr-only">
          Budgeted hours
        </label>
        <input
          id="budget-hours"
          type="number"
          name="budgetHours"
          min="1"
          step="1"
          defaultValue={budgetHours ?? ""}
          placeholder="Budgeted hours"
          style={{ width: 140 }}
        />
        <SubmitButton className="btn" pendingText="Saving…">
          Set budget
        </SubmitButton>
      </form>

      {entries.length === 0 ? (
        <p className="empty">No time logged yet.</p>
      ) : (
        entries.slice(0, 8).map((e) => (
          <div className="activity-row" key={e.id}>
            <span className="activity-time">{formatDate(e.logged_at)}</span>
            <span className="activity-text">
              <span className="activity-actor">{e.logged_by}</span>
              {e.hours} hrs{e.note && ` — ${e.note}`}
            </span>
          </div>
        ))
      )}

      <form action={logTimeAction} className="panel" style={{ marginTop: 20 }}>
        <p className="panel-title">Log time</p>
        <div className="field-row">
          <div className="field">
            <label htmlFor="log-by">Your name</label>
            <input id="log-by" type="text" name="loggedBy" required />
          </div>
          <div className="field">
            <label htmlFor="log-hours">Hours</label>
            <input
              id="log-hours"
              type="number"
              name="hours"
              min="0.25"
              step="0.25"
              required
            />
          </div>
          <div className="field" style={{ flex: "1 1 200px" }}>
            <label htmlFor="log-note">Note (optional)</label>
            <input id="log-note" type="text" name="note" />
          </div>
          <input type="hidden" name="engagementId" value={engagementId} />
          <SubmitButton className="btn" pendingText="Logging…">
            Log
          </SubmitButton>
        </div>
      </form>
    </section>
  );
}
