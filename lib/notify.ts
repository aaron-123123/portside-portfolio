import { queryAsAdmin } from "./db";
import type { UpdateKind } from "./types";

/**
 * Record a client-facing status update.
 *
 * Two delivery channels, one call:
 *   1. Always append to the in-app Updates feed (the source of truth).
 *   2. If an email provider is configured, also push an email.
 *
 * The email path is fully wired but stays inert until RESEND_API_KEY,
 * NOTIFY_FROM_EMAIL, and CLIENT_NOTIFY_EMAIL are set — so "real push" is a
 * config change, not a code change.
 */
export async function notifyClient(params: {
  engagementId: string;
  kind: UpdateKind;
  summary: string;
}): Promise<void> {
  await queryAsAdmin(
    "insert into updates (engagement_id, kind, summary) values ($1, $2, $3)",
    [params.engagementId, params.kind, params.summary],
  );
  await maybeSendEmail(params.summary);
}

/** Whether the email-push path is wired up (EM-only status display). */
export function isEmailPushConfigured(): boolean {
  return Boolean(
    process.env.RESEND_API_KEY &&
      process.env.CLIENT_NOTIFY_EMAIL &&
      process.env.NOTIFY_FROM_EMAIL,
  );
}

async function maybeSendEmail(summary: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.CLIENT_NOTIFY_EMAIL;
  const from = process.env.NOTIFY_FROM_EMAIL;

  // Not configured: the in-app feed is the delivery channel. No-op by design.
  if (!apiKey || !to || !from) return;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to,
        subject: "Portside — engagement update",
        text: summary,
      }),
    });
  } catch {
    // Email is best-effort; the in-app feed already captured the update.
  }
}
