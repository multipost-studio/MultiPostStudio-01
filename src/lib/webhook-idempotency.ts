import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Release a claim so a retried delivery can be processed again. Called ONLY
 * when the handler threw before completing: the provider will redeliver, and
 * without releasing, the retry would be dropped as a "duplicate" and the
 * event (a payment, a cancellation) would be lost silently. Never call this
 * after side effects completed — that path must stay claimed.
 */
export async function releaseWebhookEvent(
  provider: string,
  eventId: string | undefined | null,
): Promise<void> {
  if (!eventId) return;
  try {
    await db.webhookEvent.delete({ where: { provider_eventId: { provider, eventId } } });
  } catch (e) {
    logger.warn({ err: e, provider, eventId }, "webhook claim release failed");
  }
}
export async function claimWebhookEvent(
  provider: string,
  eventId: string | undefined | null,
  type: string,
): Promise<boolean> {
  // Claim an inbound event exactly once. Uniqueness is enforced by the DB
  // (@@unique([provider, eventId])), not by read-then-write, so concurrent
  // deliveries can't both win. Both providers retry on timeout/5xx and can be
  // replayed by hand — without this, duplicates re-apply plans, mirror extra
  // invoices, and re-grant referral credits.
  // No id from the provider means we can't dedup — process it rather than drop
  // a real event, and say so in the logs.
  if (!eventId) {
    logger.warn({ provider, type }, "webhook has no event id — cannot dedup");
    return true;
  }
  try {
    await db.webhookEvent.create({ data: { provider, eventId, type } });
    return true;
  } catch (e) {
    // ONLY a unique-constraint violation (P2002) means "already handled".
    // Anything else — table missing because a migration hasn't run, DB
    // unreachable — must fall through and process the event. Treating an
    // infrastructure error as "duplicate" would silently drop every billing
    // webhook, so paid subscriptions would never activate.
    const code = (e as { code?: string })?.code;
    if (code === "P2002") {
      logger.info({ provider, eventId, type }, "duplicate webhook ignored");
      return false;
    }
    logger.error(
      { err: e, provider, eventId, type },
      "webhook dedup unavailable — processing the event anyway (at-least-once)",
    );
    return true;
  }
}
