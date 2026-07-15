import { formatTimestamp } from "@/lib/format";
import type { EngagementStatus, Health } from "@/lib/status";

const HEALTH_CHIP: Record<Health, string> = {
  green: "chip--ontrack",
  amber: "chip--risk",
  red: "chip--blocked",
};

function formatDate(date: string | null): string {
  if (!date) return "No date set";
  // target_date is a plain YYYY-MM-DD; show it without the time part.
  return formatTimestamp(`${date}T00:00:00Z`).replace(" 00:00 UTC", "");
}

/**
 * One-glance engagement status. Shown on its own for the client sponsor, and at
 * the top of the EM and project-lead views.
 */
export function StatusCard({
  status,
  openDecisions,
  openActions,
  actionsLabel,
  latestPulse,
  variant = "full",
}: {
  status: EngagementStatus;
  openDecisions: number;
  openActions: number;
  actionsLabel: string;
  latestPulse: number | null;
  // "glance" (sponsor) hides stats the tier can't act on.
  variant?: "full" | "glance";
}) {
  const glance = variant === "glance";
  return (
    <div className="status-card">
      <div className="status-head">
        <span className={`chip ${HEALTH_CHIP[status.health]}`}>
          {status.healthLabel}
        </span>
        <span className="status-pct">{status.percent}% complete</span>
      </div>

      <div className="progress" aria-hidden="true">
        <div className="progress-fill" style={{ width: `${status.percent}%` }} />
      </div>

      <div className="status-grid">
        <div className="stat">
          <span className="stat-label">Milestones done</span>
          <span className="stat-value">
            {status.done}/{status.total}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Next up</span>
          <span className="stat-value">{status.next?.title ?? "—"}</span>
          <span className="stat-sub">
            {status.next ? formatDate(status.next.target_date) : "All complete"}
          </span>
        </div>
        {!glance && (
          <>
            <div className="stat">
              <span className="stat-label">Open decisions</span>
              <span className="stat-value">{openDecisions}</span>
            </div>
            <div className="stat">
              <span className="stat-label">{actionsLabel}</span>
              <span className="stat-value">{openActions}</span>
            </div>
          </>
        )}
        <div className="stat">
          <span className="stat-label">Latest pulse</span>
          <span className="stat-value">
            {latestPulse != null ? `${latestPulse}/5` : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
