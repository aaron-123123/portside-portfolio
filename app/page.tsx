import Link from "next/link";
import { isConfigured } from "@/lib/supabase";
import { getEngagements, getEngagementStatuses } from "@/lib/data";
import { getRole } from "@/lib/session";
import type { Health } from "@/lib/status";
import { ConfigNotice } from "@/app/components/ConfigNotice";

export const dynamic = "force-dynamic";

const HEALTH_CHIP: Record<Health, string> = {
  green: "chip--ontrack",
  amber: "chip--risk",
  red: "chip--blocked",
};

const LEDE: Record<string, string> = {
  em: "Every engagement has a private space for the delivery team and a shared space visible to the client. Select a client to open their workspace.",
  client_contact:
    "Your shared workspace with the delivery team. Select your engagement to review status, documents, and sign-offs.",
  client_exec:
    "Delivery status across your engagements. Select one for the summary.",
};

export default async function Home() {
  if (!isConfigured()) return <ConfigNotice />;

  const role = await getRole();
  const [engagements, statuses] = await Promise.all([
    getEngagements(),
    getEngagementStatuses(),
  ]);

  return (
    <main className="container">
      <p className="eyebrow">Engagements</p>
      <h1 className="page-title">Client delivery spaces</h1>
      <p className="lede">{LEDE[role]}</p>

      {engagements.length === 0 ? (
        <p className="empty">No engagements yet.</p>
      ) : (
        <div className="roster">
          {engagements.map((e) => {
            const s = statuses[e.id];
            return (
              <Link
                key={e.id}
                href={`/engagement/${e.id}`}
                className="roster-row"
              >
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
    </main>
  );
}
