import type { CsatOverview as CsatOverviewData } from "@/lib/data";

function tier(average: number): "good" | "caution" | "concern" {
  if (average >= 4) return "good";
  if (average >= 3) return "caution";
  return "concern";
}

/**
 * EM-only rollup of pulse/CSAT across every engagement. The per-engagement
 * average already exists on each engagement page — this is the one place
 * that shows whether satisfaction is holding up across the whole practice,
 * sorted worst-first so a dip is visible without opening each engagement.
 */
export function CsatOverview({ data }: { data: CsatOverviewData }) {
  if (data.totalResponses === 0) {
    return null;
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Client Pulse</h2>
        <span className="section-note">All engagements</span>
      </div>

      <div className="pulse-summary" style={{ marginBottom: 20 }}>
        <div className="stat">
          <span className="stat-label">Overall average</span>
          <span className="stat-value">
            {data.overallAverage?.toFixed(1)}
            <span className="pulse-outof">/5</span>
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Responses</span>
          <span className="stat-value">{data.totalResponses}</span>
        </div>
      </div>

      <div className="csat-list">
        {data.byEngagement.map((row) => (
          <div className="csat-row" key={row.engagementId}>
            <span className="csat-name">{row.clientName}</span>
            <div className="csat-track" aria-hidden="true">
              <div
                className={`csat-fill csat-fill--${tier(row.average)}`}
                style={{ width: `${(row.average / 5) * 100}%` }}
              />
            </div>
            <span className="csat-score">
              {row.average.toFixed(1)}
              <span className="pulse-outof">/5</span>
            </span>
            <span className="csat-count">
              {row.count} response{row.count === 1 ? "" : "s"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
