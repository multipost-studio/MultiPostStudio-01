import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createForWorkspace } from "./service";
import { platformName } from "./types";

/** Roles that can do something about a dead connection. Viewers, analysts and clients cannot reconnect. */
const CAN_RECONNECT = ["manager", "editor", "creator"];

const dayKey = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * A connected account stopped working (revoked, expired, or its refresh failed). Called from the single
 * place that flips an account to "expired", and only on the actual transition, so it fires once per
 * incident rather than on every failed tick. Never throws.
 */
export async function notifyAccountExpired(accountId: string): Promise<void> {
  try {
    const acc = await db.socialAccount.findUnique({
      where: { id: accountId },
      select: { id: true, workspaceId: true, platform: true, displayName: true },
    });
    if (!acc) return;
    const name = platformName(acc.platform);
    await createForWorkspace(
      acc.workspaceId,
      {
        type: "account_expired",
        title: `Reconnect ${name}`,
        body: `${acc.displayName ? `${acc.displayName} (${name})` : name} lost its connection, so posts to it will fail until it is reconnected.`,
        linkUrl: "/integrations",
        actionLabel: "Reconnect",
        platform: acc.platform,
        entityType: "social_account",
        entityId: acc.id,
        dedupeKey: `account_expired:${acc.id}:${dayKey()}`,
      },
      { roles: CAN_RECONNECT },
    );
  } catch (err) {
    logger.warn({ err, accountId }, "account expired notification failed");
  }
}

/**
 * A connection that cannot renew itself (no refresh token) is about to run out. One reminder per account
 * per expiry date; accounts that refresh automatically are never flagged.
 */
export async function notifyAccountsExpiringSoon(now = new Date(), withinDays = 7): Promise<number> {
  const horizon = new Date(now.getTime() + withinDays * 86_400_000);
  const rows = await db.socialAccount.findMany({
    where: { status: "connected", refreshToken: null, tokenExpiresAt: { gt: now, lte: horizon } },
    select: { id: true, workspaceId: true, platform: true, displayName: true, tokenExpiresAt: true },
    take: 200,
  });
  let n = 0;
  for (const a of rows) {
    const name = platformName(a.platform);
    const days = Math.max(1, Math.ceil(((a.tokenExpiresAt as Date).getTime() - now.getTime()) / 86_400_000));
    const r = await createForWorkspace(
      a.workspaceId,
      {
        type: "account_expiring",
        title: `${name} connection expires soon`,
        body: `${a.displayName || name} will need reconnecting in about ${days} day${days === 1 ? "" : "s"}. Reconnect now to avoid failed posts.`,
        linkUrl: "/integrations",
        actionLabel: "Reconnect",
        platform: a.platform,
        entityType: "social_account",
        entityId: a.id,
        dedupeKey: `account_expiring:${a.id}:${(a.tokenExpiresAt as Date).toISOString().slice(0, 10)}`,
        expiresAt: a.tokenExpiresAt,
      },
      { roles: CAN_RECONNECT },
    );
    n += r.created;
  }
  return n;
}
