import { addActionItemAction, completeActionItemAction } from "@/app/actions";
import { formatTimestamp } from "@/lib/format";
import type { ActionItem, Role } from "@/lib/types";

function formatDate(date: string | null): string | null {
  if (!date) return null;
  return formatTimestamp(`${date}T00:00:00Z`).replace(" 00:00 UTC", "");
}

export function ActionRequired({
  items,
  role,
  engagementId,
  pendingApprovals,
}: {
  items: ActionItem[];
  role: Role;
  engagementId: string;
  pendingApprovals: number;
}) {
  const isEm = role === "em";
  const isLead = role === "client_contact";
  const open = items.filter((i) => i.status === "open");
  const done = items.filter((i) => i.status === "done");

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">
          {isEm ? "Action Items" : "Action Required"}
        </h2>
        <span className="section-note">
          {isEm ? "Both sides" : "Your open items"}
        </span>
      </div>

      {!isEm && pendingApprovals > 0 && (
        <p className="notice">
          {pendingApprovals} document
          {pendingApprovals === 1 ? "" : "s"} awaiting your sign-off — see the
          Shared Space below.
        </p>
      )}

      {open.length === 0 ? (
        <p className="empty">Nothing outstanding.</p>
      ) : (
        open.map((item) => {
          const due = formatDate(item.due_date);
          const ownerIsClient = item.owner_side === "client";
          const canComplete = isEm || (isLead && ownerIsClient);
          return (
            <div className="doc-row" key={item.id}>
              <div className="doc-main">
                <span className="item-name">{item.title}</span>
                <div className="doc-meta">
                  {due ? `Due ${due}` : "No due date"}
                </div>
              </div>
              <span
                className={`chip ${ownerIsClient ? "chip--client" : "chip--team"}`}
              >
                {ownerIsClient ? "Client" : "Team"}
              </span>
              <div className="doc-actions">
                {canComplete && (
                  <form action={completeActionItemAction} className="inline-form">
                    <input type="hidden" name="actionId" value={item.id} />
                    <input
                      type="hidden"
                      name="engagementId"
                      value={engagementId}
                    />
                    <button type="submit" className="btn">
                      Mark done
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })
      )}

      {done.length > 0 && (
        <div className="action-done-list">
          {done.map((item) => (
            <div className="action-done" key={item.id}>
              <span className="chip chip--done">Done</span>
              <span>{item.title}</span>
            </div>
          ))}
        </div>
      )}

      {isEm && (
        <form
          action={addActionItemAction}
          className="panel"
          style={{ marginTop: 20 }}
        >
          <p className="panel-title">Add an action item</p>
          <div className="field-row">
            <div className="field" style={{ flex: "1 1 240px" }}>
              <label htmlFor="ai-title">Title</label>
              <input id="ai-title" type="text" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="ai-owner">Owner</label>
              <select id="ai-owner" name="owner_side" defaultValue="client">
                <option value="client">Client</option>
                <option value="team">Team</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="ai-due">Due date</label>
              <input id="ai-due" type="date" name="due_date" />
            </div>
            <input type="hidden" name="engagementId" value={engagementId} />
            <button type="submit" className="btn">
              Add
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
