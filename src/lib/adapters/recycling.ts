import { db } from "@/lib/db";
import { enqueuePublish } from "@/lib/adapters/queue";
import { hasEntitlement } from "@/lib/entitlements";
import { logActivity } from "@/lib/events";
import { logger } from "@/lib/logger";

/**
 * Evergreen recycling.
 *
 * /recycling let people create rules ("every 30d, max 3 reposts, ≥14d gap"),
 * attach published posts to them, and see them listed — and nothing in the
 * codebase ever read a RecycleRule. No tick, no worker, no job. The page
 * described "rules-based reposting of evergreen content", the Pro plan sold
 * "Evergreen recycling" as a feature, and no post was ever reposted.
 *
 * A repost is a real copy of the source post (its own row, channels and
 * media), scheduled through the same publish queue as anything else, and it
 * carries `recycledFromId`. Repost count and last-recycled time are derived
 * from those rows rather than kept in counter columns, so they cannot drift
 * from what actually went out.
 *
 * The copy never carries `recycleRuleId`, so a repost is not itself a
 * recycling source — reposts cannot cascade.
 */

const DAY_MS = 86_400_000;

/** How many reposts one call will schedule, across all workspaces. */
const MAX_PER_TICK = 20;

export type RecycleResult = { scheduled: number };

export async function runDueRecycling(now = new Date()): Promise<RecycleResult> {
  const rules = await db.recycleRule.findMany({
    where: {
      enabled: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    include: { workspace: { select: { id: true, orgId: true } } },
  });

  let scheduled = 0;

  for (const rule of rules) {
    if (scheduled >= MAX_PER_TICK) break;

    // Recycling is a paid feature. A workspace whose org downgraded must stop
    // getting reposts, not keep them because the rule row still exists.
    if (!(await hasEntitlement(rule.workspace.orgId, "evergreen_recycling"))) continue;

    // Spacing between two reposts from the same rule, so a rule with several
    // attached posts doesn't fire them all on the same day.
    const lastFromRule = await db.post.findFirst({
      where: {
        workspaceId: rule.workspaceId,
        recycledFromId: { not: null },
        recycledFrom: { recycleRuleId: rule.id },
      },
      orderBy: { scheduledAt: "desc" },
      select: { scheduledAt: true },
    });
    if (
      lastFromRule?.scheduledAt &&
      now.getTime() - lastFromRule.scheduledAt.getTime() < rule.minGapDays * DAY_MS
    ) {
      continue;
    }

    const sources = await db.post.findMany({
      where: {
        recycleRuleId: rule.id,
        workspaceId: rule.workspaceId,
        isEvergreen: true,
        status: "published",
        publishedAt: { not: null },
        archivedAt: null,
      },
      include: {
        channels: { select: { channelId: true, platform: true, body: true, contentType: true } },
        media: { select: { mediaId: true, order: true } },
        tags: { select: { tagId: true } },
        recycles: { select: { id: true, scheduledAt: true, createdAt: true } },
      },
    });

    // Oldest activity first, so every attached post gets a turn before any
    // post is recycled twice.
    const eligible = sources
      .map((p) => ({ post: p, lastAt: lastActivity(p) }))
      .filter(({ post }) => post.channels.length > 0 && dueForRecycle(post, rule, now))
      .sort((a, b) => a.lastAt - b.lastAt);

    for (const { post } of eligible) {
      if (scheduled >= MAX_PER_TICK) break;
      try {
        const copy = await db.post.create({
          data: {
            workspaceId: post.workspaceId,
            authorId: post.authorId,
            title: post.title,
            status: "scheduled",
            scheduledAt: now,
            campaignId: post.campaignId,
            pillarId: post.pillarId,
            firstComment: post.firstComment,
            utmSource: post.utmSource,
            utmMedium: post.utmMedium,
            utmCampaign: post.utmCampaign,
            // Not evergreen and not attached to the rule: a repost must never
            // become a source for further reposts.
            isEvergreen: false,
            recycledFromId: post.id,
            channels: {
              create: post.channels.map((c) => ({
                channelId: c.channelId,
                platform: c.platform,
                body: c.body,
                contentType: c.contentType,
                status: "scheduled",
              })),
            },
            media: { create: post.media.map((m) => ({ mediaId: m.mediaId, order: m.order })) },
            tags: { create: post.tags.map((t) => ({ tagId: t.tagId })) },
          },
        });
        await enqueuePublish(copy.id, now);
        await logActivity({
          workspaceId: post.workspaceId,
          verb: "recycled",
          entityType: "post",
          entityId: copy.id,
          summary: `Recycled "${post.title ?? "a post"}" (${post.recycles.length + 1} of ${rule.maxReposts}) via rule "${rule.name}"`,
        });
        scheduled++;
        // One repost per rule per tick — minGapDays governs the next one.
        break;
      } catch (err) {
        logger.error({ err, ruleId: rule.id, postId: post.id }, "evergreen recycling failed to schedule a repost");
      }
    }
  }

  return { scheduled };
}

/**
 * Has this post earned another repost yet?
 *
 * Two independent caps, both from the rule the user configured:
 *  - maxReposts: total reposts ever made from this post.
 *  - frequencyDays: time since this post last went out — the original publish
 *    or its most recent repost, whichever is later.
 *
 * (minGapDays is a rule-wide cap, not a per-post one, so it is applied by the
 * caller across all posts attached to the rule.)
 */
export function dueForRecycle(
  post: { publishedAt: Date | null; recycles: { scheduledAt: Date | null; createdAt: Date }[] },
  rule: { maxReposts: number; frequencyDays: number },
  now: Date,
): boolean {
  if (post.recycles.length >= rule.maxReposts) return false;
  if (!post.publishedAt) return false; // never went out; nothing to recycle
  return now.getTime() - lastActivity(post) >= rule.frequencyDays * DAY_MS;
}

/** When this post last went out, original publish or most recent repost. */
export function lastActivity(post: {
  publishedAt: Date | null;
  recycles: { scheduledAt: Date | null; createdAt: Date }[];
}): number {
  const times = [
    post.publishedAt?.getTime() ?? 0,
    ...post.recycles.map((r) => (r.scheduledAt ?? r.createdAt).getTime()),
  ];
  return Math.max(...times);
}
