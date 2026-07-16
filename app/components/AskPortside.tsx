import { askPortsideAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { isAiConfigured } from "@/lib/ai";
import { formatTimestamp } from "@/lib/format";
import type { AiAnswer } from "@/lib/types";

/**
 * The flagship AI feature: a question answered ONLY from data the asking
 * role's RLS-scoped query already returned (see askPortsideAction). Every
 * tier gets this panel, and each tier's history is genuinely its own — an
 * EM sees every role's questions; a client tier sees only its own, exactly
 * the same boundary that governs documents and the audit log.
 */
export function AskPortside({
  engagementId,
  answers,
}: {
  engagementId: string;
  answers: AiAnswer[];
}) {
  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Ask Portside</h2>
        <span className="section-note">AI, scoped to what you can see</span>
      </div>

      {!isAiConfigured() && (
        <p className="notice">
          AI features are not configured in this environment (no OPENROUTER_API_KEY set) —
          this panel is wired but inert.
        </p>
      )}

      {answers.length === 0 ? (
        <p className="empty">No questions asked yet.</p>
      ) : (
        <div className="qa-list">
          {answers.map((a) => (
            <div className="qa-item" key={a.id}>
              <p className="qa-question">{a.question}</p>
              <p className="qa-answer">{a.answer}</p>
              <span className="qa-meta">{formatTimestamp(a.created_at)}</span>
            </div>
          ))}
        </div>
      )}

      <form action={askPortsideAction} className="inline-form" style={{ marginTop: 12 }}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <label htmlFor="ask-question" className="sr-only">
          Ask a question
        </label>
        <input
          id="ask-question"
          type="text"
          name="question"
          placeholder="Ask a question about this engagement…"
          maxLength={500}
          required
          style={{ minWidth: 320, flex: "1 1 320px" }}
          disabled={!isAiConfigured()}
        />
        <SubmitButton className="btn" pendingText="Asking…" disabled={!isAiConfigured()}>
          Ask
        </SubmitButton>
      </form>
    </section>
  );
}
