import Link from "next/link";
import { isConfigured } from "@/lib/supabase";
import { getCsatOverview, getEngagements, getEngagementStatuses } from "@/lib/data";
import { getRole } from "@/lib/session";
import { ConfigNotice } from "@/app/components/ConfigNotice";
import { EngagementSearch } from "@/app/components/EngagementSearch";
import { CsatOverview } from "@/app/components/CsatOverview";

export const dynamic = "force-dynamic";

const LEDE: Record<string, string> = {
  em: "Every engagement has a private space for the delivery team and a shared space visible to the client. Select a client to open their workspace.",
  client_contact:
    "Your shared workspace with the delivery team. Select your engagement to review status, documents, and sign-offs.",
  client_exec:
    "Delivery status across your engagements. Select one for the summary.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  if (!isConfigured()) return <ConfigNotice />;

  const role = await getRole();
  const isEm = role === "em";
  const { archived } = await searchParams;
  // Only EM may look at the archived roster — everyone else always sees active.
  const showArchived = isEm && archived === "1";

  const [engagements, statuses, csat] = await Promise.all([
    getEngagements(showArchived ? "archived" : "active"),
    getEngagementStatuses(),
    isEm ? getCsatOverview() : Promise.resolve(null),
  ]);

  return (
    <main className="container">
      <p className="eyebrow">Engagements</p>
      <h1 className="page-title">Client delivery spaces</h1>
      <p className="lede">{LEDE[role]}</p>

      {isEm && (
        <p className="lifecycle-tabs">
          <Link href="/" className={showArchived ? undefined : "active"}>
            [ Active ]
          </Link>{" "}
          <Link href="/?archived=1" className={showArchived ? "active" : undefined}>
            [ Archived ]
          </Link>
        </p>
      )}

      {engagements.length === 0 ? (
        <p className="empty">
          {showArchived ? "No archived engagements." : "No engagements yet."}
        </p>
      ) : (
        <EngagementSearch engagements={engagements} statuses={statuses} />
      )}

      {csat && <CsatOverview data={csat} />}
    </main>
  );
}
