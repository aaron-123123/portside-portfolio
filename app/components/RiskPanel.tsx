import { analyzeRisksAction } from "@/app/actions";
import { SubmitButton } from "@/app/components/SubmitButton";
import { isAiConfigured } from "@/lib/ai";
import type { AiDraft, RiskFlagsDraftContent, RiskSignal } from "@/lib/types";

const KIND_LABEL: Record<RiskSignal["kind"], string> = {
  overdue_milestone: "Overdue milestone",
  blocked_milestone: "Blocked milestone",
  overdue_action: "Overdue action item",
  low_pulse: "Low pulse score",
};

// Coral (chip--blocked) is reserved for a genuine blocked/decision state,
// same as the milestone timeline's own BLOCKED chip. Everything else here
// is a warning, not a stoppage — chip--risk (rust outline), matching the
// engagement-level "AT RISK" tier, not "BLOCKED".
const KIND_CHIP: Record<RiskSignal["kind"], string> = {
  overdue_milestone: "chip--risk",
  blocked_milestone: "chip--blocked",
  overdue_action: "chip--risk",
  low_pulse: "chip--risk",
};

/**
 * EM-only. Signal DETECTION is deterministic and always on (lib/risk.ts —
 * no AI, no cost, works even with no OPENROUTER_API_KEY). The AI layer only
 * adds a one-line "why it matters" note on top, on demand.
 */
export function RiskPanel({
  engagementId,
  signals,
  draft,
}: {
  engagementId: string;
  signals: RiskSignal[];
  draft: AiDraft | null;
}) {
  const notes = draft ? (draft.content as RiskFlagsDraftContent).notes : [];
  const noteFor = (ref: string) => notes.find((n) => n.ref === ref)?.note;

  return (
    <section className="section">
      <div className="section-head">
        <h2 className="section-title">Needs Attention</h2>
        <span className="section-note">Derived automatically</span>
      </div>

      {signals.length === 0 ? (
        <p className="empty">No risk signals detected.</p>
      ) : (
        <>
          {signals.map((s) => (
            <div className="activity-row" key={s.ref}>
              <span className={`chip ${KIND_CHIP[s.kind]}`}>{KIND_LABEL[s.kind]}</span>
              <span className="activity-text">
                <span className="activity-actor">{s.title}</span>
                {noteFor(s.ref) ?? s.detail}
              </span>
            </div>
          ))}

          {isAiConfigured() && (
            <form action={analyzeRisksAction} className="inline-form" style={{ marginTop: 12 }}>
              <input type="hidden" name="engagementId" value={engagementId} />
              <SubmitButton className="btn" pendingText="Analyzing…">
                Explain with AI
              </SubmitButton>
            </form>
          )}
        </>
      )}
    </section>
  );
}
