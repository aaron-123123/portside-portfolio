"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Engagement } from "@/lib/types";
import type { EngagementStatus, Health } from "@/lib/status";

const HEALTH_CHIP: Record<Health, string> = {
  green: "chip--ontrack",
  amber: "chip--risk",
  red: "chip--blocked",
};

/**
 * Client-side name filter over the engagement roster. All rows are already
 * on the page (server-rendered) — this only ever hides/shows them, so there
 * is no extra data fetch as the list grows.
 */
export function EngagementSearch({
  engagements,
  statuses,
}: {
  engagements: Engagement[];
  statuses: Record<string, EngagementStatus>;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return engagements;
    return engagements.filter((e) => e.client_name.toLowerCase().includes(q));
  }, [query, engagements]);

  return (
    <>
      {engagements.length > 5 && (
        <div className="field" style={{ marginBottom: 20, maxWidth: 320 }}>
          <label htmlFor="engagement-search">Filter by client name</label>
          <input
            id="engagement-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Fabrikam"
            style={{ minWidth: 0 }}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="empty">No engagements match &quot;{query}&quot;.</p>
      ) : (
        <div className="roster">
          {filtered.map((e) => {
            const s = statuses[e.id];
            return (
              <Link key={e.id} href={`/engagement/${e.id}`} className="roster-row">
                <span className="roster-name">{e.client_name}</span>
                <span className="roster-status">
                  {s && s.total > 0 ? (
                    <>
                      <span className={`chip ${HEALTH_CHIP[s.health]}`}>
                        {s.healthLabel}
                      </span>
                      <span className="roster-meta">{s.percent}% complete</span>
                    </>
                  ) : (
                    <span className="roster-meta">Not started</span>
                  )}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
