import { formatTimestamp } from "@/lib/format";
import type { Update } from "@/lib/types";

/**
 * Client-facing status feed. Rows are appended automatically by the server when
 * client-relevant things happen — no one writes these by hand.
 */
export function UpdatesFeed({
  updates,
  title = "Updates",
  emailPushConfigured,
}: {
  updates: Update[];
  title?: string;
  // EM-only: show whether the (currently inert-by-default) email push is
  // actually configured, alongside this always-on in-app feed.
  emailPushConfigured?: boolean;
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">{title}</h2>
        <span className="section-note">Auto-generated</span>
      </div>
      {emailPushConfigured !== undefined && (
        <p className="notice">
          Email push:{" "}
          {emailPushConfigured
            ? "configured — client-relevant events also send an email."
            : "not configured — this in-app feed is the only delivery channel."}
        </p>
      )}
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
