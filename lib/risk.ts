import type { ActionItem, CheckIn, Milestone, RiskSignal } from "./types";

/**
 * Detect risk signals from data already on the page — no AI involved. This
 * always works, even with no OPENROUTER_API_KEY configured; the AI layer (see
 * analyzeRisksAction) only adds a one-line "why" phrasing on top.
 */
function todayUTC(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function computeRiskSignals(
  milestones: Milestone[],
  actionItems: ActionItem[],
  checkIns: CheckIn[],
): RiskSignal[] {
  const today = todayUTC();
  const signals: RiskSignal[] = [];

  for (const m of milestones) {
    if (m.status === "blocked") {
      signals.push({
        ref: `milestone:${m.id}`,
        kind: "blocked_milestone",
        title: m.title,
        detail: "Marked blocked.",
      });
    } else if (m.status !== "done" && m.target_date !== null && m.target_date < today) {
      signals.push({
        ref: `milestone:${m.id}`,
        kind: "overdue_milestone",
        title: m.title,
        detail: `Target date ${m.target_date} has passed.`,
      });
    }
  }

  for (const a of actionItems) {
    if (a.status === "open" && a.due_date !== null && a.due_date < today) {
      signals.push({
        ref: `action:${a.id}`,
        kind: "overdue_action",
        title: a.title,
        detail: `Due ${a.due_date}, still open (${a.owner_side === "team" ? "team" : "client"}-owned).`,
      });
    }
  }

  const latestSubmitted = checkIns
    .filter((c) => c.status === "submitted" && c.score !== null)
    .sort(
      (a, b) => new Date(b.submitted_at ?? 0).getTime() - new Date(a.submitted_at ?? 0).getTime(),
    )[0];
  if (latestSubmitted && (latestSubmitted.score ?? 5) <= 2) {
    signals.push({
      ref: `pulse:${latestSubmitted.id}`,
      kind: "low_pulse",
      title: "Latest pulse check",
      detail: `Scored ${latestSubmitted.score}/5${latestSubmitted.comment ? `: "${latestSubmitted.comment}"` : "."}`,
    });
  }

  return signals;
}
