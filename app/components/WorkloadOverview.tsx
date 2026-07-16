import type { AssigneeWorkload } from "@/lib/data";

/**
 * EM-only rollup of open, team-owned action items by assignee, across every
 * engagement — sorted busiest-first, the same shape as the CSAT rollup, so an
 * overloaded team member is as visible as a dissatisfied client.
 */
export function WorkloadOverview({ data }: { data: AssigneeWorkload[] }) {
  if (data.length === 0) {
    return null;
  }

  const max = Math.max(...data.map((a) => a.openCount));

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Team Workload</h2>
        <span className="section-note">Open action items, by assignee</span>
      </div>

      <div className="csat-list">
        {data.map((a) => (
          <div className="csat-row" key={a.assignee}>
            <span className="csat-name">{a.assignee}</span>
            <div className="csat-track" aria-hidden="true">
              <div
                className={`csat-fill ${a.overdueCount > 0 ? "csat-fill--concern" : "csat-fill--good"}`}
                style={{ width: `${(a.openCount / max) * 100}%` }}
              />
            </div>
            <span className="csat-score">{a.openCount} open</span>
            <span className="csat-count">
              {a.overdueCount > 0
                ? `${a.overdueCount} overdue`
                : "none overdue"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
