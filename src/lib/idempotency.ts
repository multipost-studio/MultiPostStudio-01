import { claimWebhookEvent } from "@/lib/webhook-idempotency";

/**
 * Generic idempotency for server actions / API routes (publishing, billing,
 * uploads). Reuses the atomic WebhookEvent(provider,eventId) claim so no
 * migration is needed: provider "api", eventId = caller key.
 *
 * Returns true when this call owns the key (proceed), false when a duplicate
 * is already in flight or completed (skip). Callers must choose keys that
 * include the user/org + action + stable payload hash, e.g.
 * `publish:${userId}:${postId}:${bodyHash}`.
 */
export async function claimIdempotencyKey(key: string, type = "api"): Promise<boolean> {
  if (!key || key.length > 200) return true;
  try {
    return await claimWebhookEvent("api", key, type);
  } catch {
    // Fail-open: an idempotency-store outage must not block the action.
    return true;
  }
}
