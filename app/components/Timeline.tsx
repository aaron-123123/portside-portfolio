import { addMilestoneAction, setMilestoneStatusAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { formatTimestamp } from "@/lib/format";
import type { Milestone, MilestoneStatus, Role } from "@/lib/types";

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  blocked: "Blocked",
};

const STATUS_CHIP: Record<MilestoneStatus, string> = {
  planned: "chip--planned",
  in_progress: "chip--progress",
  done: "chip--done",
  blocked: "chip--blocked",
};

function formatDate(date: string | null): string | null {
  if (!date) return null;
  return formatTimestamp(`${date}T00:00:00Z`).replace(" 00:00 UTC", "");
}

export function Timeline({
  milestones,
  role,
  engagementId,
}: {
  milestones: Milestone[];
  role: Role;
  engagementId: string;
}) {
  const isEm = role === "em";

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Project Timeline</h2>
        <span className="section-note">Delivery milestones</span>
      </div>

      {milestones.length === 0 ? (
        <p className="empty">No milestones yet.</p>
      ) : (
        <div className="timeline">
          {milestones.map((m) => {
            const target = formatDate(m.target_date);
            const completed = m.completed_at
              ? formatTimestamp(m.completed_at)
              : null;
            return (
              <div className="tl-item" key={m.id} data-status={m.status}>
                <span className="tl-marker" aria-hidden="true" />
                <div className="tl-body">
                  <div className="tl-head">
                    <span className="tl-title">{m.title}</span>
                    <span className={`chip ${STATUS_CHIP[m.status]}`}>
                      {STATUS_LABEL[m.status]}
                    </span>
                  </div>
                  <div className="tl-meta">
                    {target ? `Target ${target}` : "No target date"}
                    {completed && m.status === "done" && ` · Completed ${completed}`}
                    {m.assignee && ` · ${m.assignee}`}
                  </div>
                  {m.detail && <p className="tl-detail">{m.detail}</p>}

                  {isEm && (
                    <form
                      action={setMilestoneStatusAction}
                      className="inline-form tl-controls"
                    >
                      <input type="hidden" name="milestoneId" value={m.id} />
                      <input
                        type="hidden"
                        name="engagementId"
                        value={engagementId}
                      />
                      <select name="status" defaultValue={m.status}>
                        <option value="planned">Planned</option>
                        <option value="in_progress">In progress</option>
                        <option value="done">Done</option>
                        <option value="blocked">Blocked</option>
                      </select>
                      <SubmitButton className="btn" pendingText="Updating…">
                        Update
                      </SubmitButton>
                    </form>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isEm && (
        <form action={addMilestoneAction} className="panel" style={{ marginTop: 20 }}>
          <p className="panel-title">Add a milestone</p>
          <div className="field-row">
            <div className="field" style={{ flex: "1 1 240px" }}>
              <label htmlFor="ms-title">Title</label>
              <input id="ms-title" type="text" name="title" required />
            </div>
            <div className="field">
              <label htmlFor="ms-date">Target date</label>
              <input id="ms-date" type="date" name="target_date" />
            </div>
            <div className="field">
              <label htmlFor="ms-assignee">Assignee (optional)</label>
              <input id="ms-assignee" type="text" name="assignee" placeholder="Team member" />
            </div>
            <input type="hidden" name="engagementId" value={engagementId} />
            <SubmitButton className="btn" pendingText="Adding…">
              Add
            </SubmitButton>
          </div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="ms-detail">Detail (optional)</label>
            <input id="ms-detail" type="text" name="detail" />
          </div>
        </form>
      )}
    </section>
  );
}
