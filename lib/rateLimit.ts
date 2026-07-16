import { queryAsAdmin } from "./db";

/**
 * Coarse per-engagement AI usage cap. This is a public demo with no login —
 * the role switcher is a UI toggle, not authentication — so nothing stops a
 * visitor from mashing an AI button. Written/read via the admin connection
 * (like audit_log) because the count must span every role, not just the
 * caller's own.
 */
const WINDOW_MINUTES = 60;
const MAX_CALLS_PER_WINDOW = 20;

export async function checkAiRateLimit(
  engagementId: string,
  feature: string,
): Promise<void> {
  const rows = await queryAsAdmin<{ n: string }>(
    `select count(*)::text as n from ai_usage_log
      where engagement_id = $1 and created_at > now() - interval '${WINDOW_MINUTES} minutes'`,
    [engagementId],
  );
  const count = Number(rows[0]?.n ?? 0);
  if (count >= MAX_CALLS_PER_WINDOW) {
    throw new Error(
      `This engagement has hit the AI usage limit for this demo (${MAX_CALLS_PER_WINDOW} requests per hour). Try again later.`,
    );
  }
  await queryAsAdmin(
    "insert into ai_usage_log (engagement_id, feature) values ($1, $2)",
    [engagementId, feature],
  );
}
