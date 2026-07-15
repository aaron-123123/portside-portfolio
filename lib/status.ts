import type { Milestone } from "./types";

export type Health = "green" | "amber" | "red";

export interface EngagementStatus {
  total: number;
  done: number;
  percent: number;
  health: Health;
  healthLabel: string;
  next: Milestone | null;
}

const HEALTH_LABEL: Record<Health, string> = {
  green: "On track",
  amber: "At risk",
  red: "Blocked",
};

function todayUTC(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * Derive the one-glance status from the milestone list. Objective and automatic:
 * no one sets a RAG flag by hand.
 *   red   — a milestone is blocked
 *   amber — an open milestone is past its target date
 *   green — otherwise
 */
export function deriveStatus(milestones: Milestone[]): EngagementStatus {
  const total = milestones.length;
  const done = milestones.filter((m) => m.status === "done").length;
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  const today = todayUTC();

  let health: Health = "green";
  if (milestones.some((m) => m.status === "blocked")) {
    health = "red";
  } else if (
    milestones.some(
      (m) =>
        m.status !== "done" &&
        m.target_date !== null &&
        m.target_date < today,
    )
  ) {
    health = "amber";
  }

  // Next up: earliest non-done milestone by target date, then order.
  const open = milestones
    .filter((m) => m.status !== "done")
    .sort((a, b) => {
      const ad = a.target_date ?? "9999-12-31";
      const bd = b.target_date ?? "9999-12-31";
      if (ad !== bd) return ad < bd ? -1 : 1;
      return a.sort_order - b.sort_order;
    });

  return {
    total,
    done,
    percent,
    health,
    healthLabel: HEALTH_LABEL[health],
    next: open[0] ?? null,
  };
}
