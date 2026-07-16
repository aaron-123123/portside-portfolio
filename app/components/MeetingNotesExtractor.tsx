import {
  addExtractedActionItemsAction,
  extractActionItemsAction,
} from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { isAiConfigured } from "@/lib/ai";
import type { ActionItemsDraftContent, AiDraft } from "@/lib/types";

/**
 * EM-only. Turns messy raw notes into the structured action-item rows the
 * app already models, in seconds — nothing writes to the database until the
 * EM reviews the list and picks which rows to keep.
 */
export function MeetingNotesExtractor({
  engagementId,
  draft,
}: {
  engagementId: string;
  draft: AiDraft | null;
}) {
  const items = draft ? (draft.content as ActionItemsDraftContent).items : [];

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Meeting Notes → Action Items</h2>
        <span className="section-note">Internal — EM only</span>
      </div>

      {!isAiConfigured() && (
        <p className="notice">
          AI features are not configured in this environment (no OPENROUTER_API_KEY set).
        </p>
      )}

      <form action={extractActionItemsAction} className="panel" style={{ marginBottom: 16 }}>
        <p className="panel-title">Paste raw notes</p>
        <div className="field" style={{ marginBottom: 12 }}>
          <label htmlFor="meeting-notes" className="sr-only">
            Meeting notes
          </label>
          <textarea
            id="meeting-notes"
            name="notes"
            rows={5}
            maxLength={8000}
            style={{ width: "100%" }}
            placeholder="Paste call notes, an email thread, or a scratch summary…"
            required
            disabled={!isAiConfigured()}
          />
        </div>
        <input type="hidden" name="engagementId" value={engagementId} />
        <SubmitButton className="btn" pendingText="Extracting…" disabled={!isAiConfigured()}>
          Extract action items
        </SubmitButton>
      </form>

      {draft && (
        <form action={addExtractedActionItemsAction} className="panel">
          <p className="panel-title">Review extracted items</p>
          {items.length === 0 ? (
            <p className="empty">No actionable items found in the last extraction.</p>
          ) : (
            <>
              {items.map((item, i) => (
                <div className="activity-row" key={`${item.title}-${i}`}>
                  <label style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <input type="checkbox" name="include" value={i} defaultChecked />
                    <span className="activity-text">
                      <span className="activity-actor">{item.title}</span>
                      <span className={`chip chip--${item.owner_side}`} style={{ marginRight: 6 }}>
                        {item.owner_side}
                      </span>
                      {item.assignee && `Assignee: ${item.assignee} · `}
                      {item.due_date ? `Due ${item.due_date}` : "No date given"}
                    </span>
                  </label>
                </div>
              ))}
              <input type="hidden" name="engagementId" value={engagementId} />
              <input type="hidden" name="draftId" value={draft.id} />
              <SubmitButton className="btn" pendingText="Adding…" style={{ marginTop: 12 }}>
                Add selected items
              </SubmitButton>
            </>
          )}
        </form>
      )}
    </section>
  );
}
