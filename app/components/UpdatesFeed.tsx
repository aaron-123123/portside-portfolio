import { formatTimestamp } from "@/lib/format";
import type { Update } from "@/lib/types";

/**
 * Client-facing status feed. Rows are appended automatically by the server when
 * client-relevant things happen — no one writes these by hand.
 */
export function UpdatesFeed({
  updates,
  title = "Updates",
}: {
  updates: Update[];
  title?: string;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="section-note">Auto-generated</span>
      </div>
      {updates.length === 0 ? (
        <p className="empty">No updates yet.</p>
      ) : (
        updates.map((u) => (
          <div className="activity-row" key={u.id}>
            <span className="activity-time">
              {formatTimestamp(u.created_at)}
            </span>
            <span className="activity-text">
              <span className="activity-actor">{u.kind}</span>
              {u.summary}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
