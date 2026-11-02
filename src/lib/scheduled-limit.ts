import { db } from "@/lib/db";

/**
 * The scheduled-posts limit is PER CHANNEL, like Buffer: a plan that allows 10 lets every connected channel hold 10 scheduled
 * posts at once, so 3 channels can hold 30. A post that goes to 3 channels takes one place on each of them. When a post goes out
 * (or is unscheduled or deleted) its place is free again.
 *
 * A limit of 0 means unlimited, like every other plan limit.
 */

/** Scheduled posts waiting on each channel of an organisation. `exceptPostId` leaves one post out, so re-saving a scheduled post never counts against itself. */
export async function scheduledCountsByChannel(orgId: string, exceptPostId?: string | null): Promise<Map<string, number>> {
  const rows = await db.postChannel.groupBy({
    by: ["channelId"],
    where: {
      status: "scheduled",
      channelId: { not: null },
      channel: { workspace: { orgId } },
      ...(exceptPostId ? { postId: { not: exceptPostId } } : {}),
    },
    _count: { _all: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) if (r.channelId) out.set(r.channelId, r._count._all);
  return out;
}

export type ChannelRef = { id: string; name: string };
export type FullChannel = ChannelRef & { used: number; limit: number };

/** The first of `channels` that has no place left for one more post, or null when they all do. */
export function firstChannelWithoutRoom(limit: number, counts: Map<string, number>, channels: ChannelRef[]): FullChannel | null {
  if (limit <= 0) return null;
  for (const c of channels) {
    const used = counts.get(c.id) ?? 0;
    if (used >= limit) return { ...c, used, limit };
  }
  return null;
}

/** How many more posts that each go to all of `channelIds` fit: the tightest channel decides. Infinity when unlimited. */
export function placesLeft(limit: number, counts: Map<string, number>, channelIds: string[]): number {
  if (limit <= 0 || channelIds.length === 0) return Infinity;
  return Math.max(0, Math.min(...channelIds.map((id) => limit - (counts.get(id) ?? 0))));
}

/** What the customer is told, in plain words, when a channel is full. */
export function scheduledLimitMessage(full: Pick<FullChannel, "name" | "limit">): string {
  return `Your plan allows ${full.limit} scheduled posts per channel, and ${full.name} already has ${full.limit}. Publish or unschedule one, or upgrade your plan for more.`;
}

/**
 * What a customer has in total and may have in total: every channel's scheduled posts against (the per-channel limit x the number
 * of connected channels). With 3 channels and a limit of 10 that is "x of 30". A limit of 0 is unlimited. Never below one
 * channel's worth, so a workspace with no channel yet still shows a real number.
 */
export function scheduledCapacity(perChannelLimit: number, channelCount: number): number {
  return perChannelLimit <= 0 ? 0 : perChannelLimit * Math.max(1, channelCount);
}
