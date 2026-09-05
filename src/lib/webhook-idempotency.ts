import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Claim an inbound webhook event exactly once.
 *
 * Returns true if this process should handle the event, false if it was already
 * handled. The uniqueness is enforced by the DB (`@@unique([provider, eventId])`),
 * not by a read-then-write check, so two concurrent deliveries of the same event
 * can't both win: the second INSERT violates the constraint and returns false.
 *
 * Both providers retry on timeout/5xx and can be replayed by hand from their
 * dashboards — without this, a duplicate delivery re-applies the plan, mirrors a
 * second paid invoice, and re-grants referral credits.
 */
export async function claimWebhookEvent(
  provider: "stripe" | "razorpay",
  eventId: string | undefined | null,
  type: string,
): Promise<boolean> {
  // No id from the provider means we can't dedup — process it rather than drop
  // a real event, and say so in the logs.
  if (!eventId) {
    logger.warn({ provider, type }, "webhook has no event id — cannot dedup");
    return true;
  }
  try {
    await db.webhookEvent.create({ data: { provider, eventId, type } });
    return true;
  } catch {
    logger.info({ provider, eventId, type }, "duplicate webhook ignored");
    return false;
  }
}
