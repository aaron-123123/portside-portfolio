import Link from "next/link";
import { notFound } from "next/navigation";
import { isConfigured } from "@/lib/supabase";
import {
  getActionItems,
  getAuditLog,
  getCheckIns,
  getDocuments,
  getEngagement,
  getMilestones,
  getPendingApprovalCount,
  getTimeEntries,
  getUpdates,
} from "@/lib/data";
import { getRole } from "@/lib/session";
import { deriveStatus } from "@/lib/status";
import { formatTimestamp } from "@/lib/format";
import { ConfigNotice } from "@/app/components/ConfigNotice";
import { StatusCard } from "@/app/components/StatusCard";
import { Timeline } from "@/app/components/Timeline";
import { ActionRequired } from "@/app/components/ActionRequired";
import { Pulse } from "@/app/components/Pulse";
import { UpdatesFeed } from "@/app/components/UpdatesFeed";
import { DocumentRow } from "@/app/components/DocumentRow";
import { UploadPanel } from "@/app/components/UploadPanel";
import { SubmitButton } from "@/app/components/SubmitButton";
import {
  setEngagementBrandingAction,
  setEngagementStatusAction,
} from "@/app/actions";
import { isEmailPushConfigured } from "@/lib/notify";
import { TimeBudget } from "@/app/components/TimeBudget";

export const dynamic = "force-dynamic";

export default async function EngagementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isConfigured()) return <ConfigNotice />;

  const { id } = await params;
  const role = await getRole();
  const isEm = role === "em";
  const isExec = role === "client_exec";
  const isLead = role === "client_contact";

  const engagement = await getEngagement(id);
  if (!engagement) notFound();

  const [milestones, actionItems, pendingApprovals, checkIns, updates] =
    await Promise.all([
      getMilestones(id),
      getActionItems(id),
      getPendingApprovalCount(id),
      getCheckIns(id),
      getUpdates(id),
    ]);
  const status = deriveStatus(milestones);

  const latestPulse =
    checkIns
      .filter((c) => c.status === "submitted" && c.score != null)
      .sort(
        (a, b) =>
          new Date(b.submitted_at ?? 0).getTime() -
          new Date(a.submitted_at ?? 0).getTime(),
      )[0]?.score ?? null;

  // The sponsor tier gets no documents (enforced by RLS); don't even query.
  const documents = isEm || isLead ? await getDocuments(id) : [];
  const audit = isEm ? await getAuditLog(id) : [];
  const timeEntries = isEm ? await getTimeEntries(id) : [];

  const privateDocs = documents.filter((d) => d.visibility === "private");
  const sharedDocs = documents.filter((d) => d.visibility === "shared");

  const openActions = actionItems.filter((i) => i.status === "open");
  const openActionsForCard = isEm
    ? openActions.length
    : openActions.filter((i) => i.owner_side === "client").length;

  return (
    <main className="container">
      <Link href="/" className="back-link">
        ← All engagements
      </Link>
      <p className="eyebrow">Engagement</p>
      <div
        className="field-row"
        style={{
          alignItems: "baseline",
          justifyContent: "space-between",
          borderLeft: engagement.accent_color
            ? `4px solid ${engagement.accent_color}`
            : undefined,
          paddingLeft: engagement.accent_color ? 14 : undefined,
        }}
      >
        <h1
          className="page-title"
          style={{ display: "flex", alignItems: "baseline", gap: 12 }}
        >
          {engagement.logo_url && (
            // eslint-disable-next-line @next/next/no-img-element -- external, EM-supplied URL; not a local asset
            <img src={engagement.logo_url} alt="" className="engagement-logo" />
          )}
          {engagement.client_name}
          {engagement.status === "archived" && (
            <span className="chip chip--archived" style={{ marginLeft: 12 }}>
              Archived
            </span>
          )}
        </h1>
        {isEm && (
          <form action={setEngagementStatusAction}>
            <input type="hidden" name="engagementId" value={id} />
            <input
              type="hidden"
              name="status"
              value={engagement.status === "archived" ? "active" : "archived"}
            />
            <SubmitButton className="btn" pendingText="Updating…">
              {engagement.status === "archived" ? "Reactivate" : "Archive"}
            </SubmitButton>
          </form>
        )}
      </div>

      {isEm && (
        <form
          action={setEngagementBrandingAction}
          className="inline-form"
          style={{ marginBottom: 24 }}
        >
          <input type="hidden" name="engagementId" value={id} />
          <label htmlFor="brand-logo" className="sr-only">
            Logo URL
          </label>
          <input
            id="brand-logo"
            type="text"
            name="logoUrl"
            placeholder="Logo URL (optional)"
            defaultValue={engagement.logo_url ?? ""}
            style={{ minWidth: 220 }}
          />
          <label htmlFor="brand-color" className="sr-only">
            Accent color
          </label>
          <input
            id="brand-color"
            type="color"
            name="accentColor"
            defaultValue={engagement.accent_color ?? "#834a33"}
          />
          <SubmitButton className="btn" pendingText="Saving…">
            Set branding
          </SubmitButton>
        </form>
      )}

      <StatusCard
        status={status}
        openDecisions={pendingApprovals}
        openActions={openActionsForCard}
        actionsLabel={isEm ? "Open action items" : "Your action items"}
        latestPulse={latestPulse}
        variant={isExec ? "glance" : "full"}
      />

      {isExec ? (
        <>
          <Timeline milestones={milestones} role={role} engagementId={id} />
          <UpdatesFeed updates={updates.slice(0, 5)} title="Recent Updates" />
          <Pulse checkIns={checkIns} role={role} engagementId={id} />
          <p className="notice">
            Sponsor view — a summary of delivery status. Your project lead has
            the full workspace, documents, and sign-offs.
          </p>
        </>
      ) : (
        <>
          <ActionRequired
            items={actionItems}
            role={role}
            engagementId={id}
            pendingApprovals={pendingApprovals}
          />

          <Pulse checkIns={checkIns} role={role} engagementId={id} />

          <UpdatesFeed
            updates={updates}
            emailPushConfigured={isEm ? isEmailPushConfigured() : undefined}
          />

          <Timeline milestones={milestones} role={role} engagementId={id} />

          {isEm && <UploadPanel engagementId={id} />}

          {/* Private space — internal to the delivery team. EM view only. */}
          {isEm && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">Private Space</h2>
                <span className="section-note">Team internal only</span>
              </div>
              {privateDocs.length === 0 ? (
                <p className="empty">No private documents.</p>
              ) : (
                privateDocs.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    doc={doc}
                    role={role}
                    engagementId={id}
                  />
                ))
              )}
            </section>
          )}

          {/* Shared space — visible to the project lead. */}
          <section className="section">
            <div className="section-head">
              <h2 className="section-title">Shared Space</h2>
              <span className="section-note">Visible to client</span>
            </div>
            {sharedDocs.length === 0 ? (
              <p className="empty">No shared documents yet.</p>
            ) : (
              sharedDocs.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  role={role}
                  engagementId={id}
                />
              ))
            )}
            {isLead && (
              <p className="notice">
                The delivery team also keeps a private internal space for this engagement.
                Those documents are enforced server-side and by the database —
                they are not retrievable from the client view.
              </p>
            )}
          </section>

          {isEm && (
            <TimeBudget
              engagementId={id}
              budgetHours={engagement.budget_hours}
              entries={timeEntries}
            />
          )}

          {/* Activity log — internal audit trail. EM view only. */}
          {isEm && (
            <section className="section">
              <div className="section-head">
                <h2 className="section-title">Activity Log</h2>
                <span className="section-note">Audit trail</span>
              </div>
              {audit.length === 0 ? (
                <p className="empty">No activity recorded yet.</p>
              ) : (
                audit.map((row) => (
                  <div key={row.id} className="activity-row">
                    <span className="activity-time">
                      {formatTimestamp(row.created_at)}
                    </span>
                    <span className="activity-text">
                      <span className="activity-actor">
                        {row.actor_role === "em" ? "Team" : "Client"}
                      </span>
                      {row.detail}
                    </span>
                  </div>
                ))
              )}
            </section>
          )}
        </>
      )}
    </main>
  );
}
