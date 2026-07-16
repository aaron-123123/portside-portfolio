import { generateStatusDigestAction, publishStatusDigestAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { isAiConfigured } from "@/lib/ai";
import type { AiDraft, StatusDigestContent } from "@/lib/types";

/**
 * EM-only. Removes the single most repetitive EM task — writing the weekly
 * status note — while keeping a human in the loop: the EM always reviews
 * and can edit the draft before it reaches the client-facing Updates feed.
 */
export function StatusDigest({
  engagementId,
  draft,
}: {
  engagementId: string;
  draft: AiDraft | null;
}) {
  const text = draft ? (draft.content as StatusDigestContent).text : "";

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">AI Status Digest</h2>
        <span className="section-note">Internal draft — EM only</span>
      </div>

      {!isAiConfigured() && (
        <p className="notice">
          AI features are not configured in this environment (no OPENROUTER_API_KEY set).
        </p>
      )}

      <form action={generateStatusDigestAction} className="inline-form" style={{ marginBottom: 12 }}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <SubmitButton className="btn" pendingText="Drafting…" disabled={!isAiConfigured()}>
          {draft ? "Regenerate draft" : "Generate update"}
        </SubmitButton>
      </form>

      {draft && (
        <form action={publishStatusDigestAction} className="panel">
          <p className="panel-title">Review before posting</p>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="digest-text" className="sr-only">
              Status update text
            </label>
            <textarea
              id="digest-text"
              name="text"
              defaultValue={text}
              rows={4}
              style={{ width: "100%" }}
              required
            />
          </div>
          <input type="hidden" name="engagementId" value={engagementId} />
          <SubmitButton className="btn" pendingText="Posting…">
            Post to client Updates feed
          </SubmitButton>
        </form>
      )}
    </section>
  );
}
