import { db } from "@/lib/db";
import { orgEntitlements } from "@/lib/entitlements";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";

/**
 * Plan gate for publishing. Connecting a channel is checked against the plan when it is added, but a
 * plan can shrink later (a downgrade, an expired subscription) and the channel stays connected, so
 * without a second check an org on Free could keep scheduling to networks only paid plans include.
 *
 * This runs wherever a post is about to be scheduled or published (it is part of the single readiness
 * check). It never disconnects or deletes anything: a channel the plan no longer covers simply can't
 * take new posts until the plan covers it again or the channel is left out of the post.
 */
export async function planBlockedChannels(postId: string): Promise<Map<string, string>> {
  const blocked = new Map<string, string>();
  const rows = await db.postChannel.findMany({
    where: { postId },
    select: { channelId: true, platform: true, post: { select: { workspace: { select: { orgId: true } } } } },
  });
  if (rows.length === 0) return blocked;
  const entitlements = await orgEntitlements(rows[0].post.workspace.orgId);
  for (const r of rows) {
    if (!entitlements.has(`platform_${r.platform}`)) {
      const label = PLATFORMS[r.platform as PlatformKey]?.label ?? r.platform;
      if (r.channelId) blocked.set(r.channelId, `Your plan doesn't include publishing to ${label}. Upgrade to post there, or leave it out of this post.`);
    }
  }
  return blocked;
}
