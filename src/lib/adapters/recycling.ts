import { db } from "@/lib/db";
import { enqueuePublish } from "@/lib/adapters/queue";
import { hasEntitlement } from "@/lib/entitlements";
import { logActivity } from "@/lib/events";
import { logger } from "@/lib/logger";

/**
 * Evergreen recycling engine.
 *
 * Reposts real copies of high-performing evergreen content according to
 * frequency, decay intervals, content pillar rules, and variation rotation.
 * Automatically halts recycling if post engagement falls below the rule's
 * exhaustion threshold.
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
        recyclePaused: false,
        recycleExhausted: false,
        ...(rule.pillarId ? { pillarId: rule.pillarId } : {}),
      },
      include: {
        channels: { select: { channelId: true, platform: true, body: true, contentType: true } },
        media: { select: { mediaId: true, order: true } },
        tags: { select: { tagId: true } },
        recycles: { select: { id: true, scheduledAt: true, createdAt: true } },
        metrics: {
          select: { engagementRate: true },
          orderBy: { capturedAt: "desc" },
          take: 1,
        },
      },
    });

    // Oldest activity first, so every attached post gets a turn before any
    // post is recycled twice.
    const eligible = sources
      .map((p) => ({ post: p, lastAt: lastActivity(p) }))
      .filter(({ post }) => {
        if (post.channels.length === 0) return false;

        // Exhaustion check: if minimum engagement rate threshold is set and post is underperforming
        if (rule.minEngagementRate && post.recycles.length > 0 && isExhaustedByEngagement(post.metrics, rule.minEngagementRate)) {
          // Flag as exhausted asynchronously to avoid blocking the loop
          db.post.update({ where: { id: post.id }, data: { recycleExhausted: true } }).catch(() => {});
          return false;
        }

        return dueForRecycle(post, rule, now);
      })
      .sort((a, b) => a.lastAt - b.lastAt);

    for (const { post } of eligible) {
      if (scheduled >= MAX_PER_TICK) break;
      try {
        const recycleCount = post.recycles.length;

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
              create: post.channels.map((c) => {
                let body = c.body;
                if (rule.rotateVariations && post.recycleVariations) {
                  body = pickNextVariation(body, post.recycleVariations, recycleCount);
                }
                if (rule.autoHashtagVariation) {
                  body = alternateHashtags(body, recycleCount + 1);
                }
                return {
                  channelId: c.channelId,
                  platform: c.platform,
                  body,
                  contentType: c.contentType,
                  status: "scheduled",
                };
              }),
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
          summary: `Recycled "${post.title ?? "a post"}" (${recycleCount + 1} of ${rule.maxReposts}) via rule "${rule.name}"`,
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
 * Supports frequency caps, decay factor intervals, and pause/exhaustion checks.
 */
export function dueForRecycle(
  post: {
    publishedAt: Date | null;
    recycles: { scheduledAt: Date | null; createdAt: Date }[];
    recyclePaused?: boolean | null;
    recycleExhausted?: boolean | null;
  },
  rule: {
    maxReposts: number;
    frequencyDays: number;
    decayFactor?: number | null;
  },
  now: Date,
): boolean {
  if (post.recyclePaused) return false;
  if (post.recycleExhausted) return false;
  if (post.recycles.length >= rule.maxReposts) return false;
  if (!post.publishedAt) return false; // never went out; nothing to recycle

  const decay = rule.decayFactor && rule.decayFactor >= 1 ? rule.decayFactor : 1.0;
  const effectiveDays = Math.round(rule.frequencyDays * Math.pow(decay, post.recycles.length));
  return now.getTime() - lastActivity(post) >= effectiveDays * DAY_MS;
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

/**
 * Rotates hashtags in the body text to vary appearance.
 */
export function alternateHashtags(body: string, seed = 0): string {
  const hashtagRegex = /#[\w\d_-]+/g;
  const tags = body.match(hashtagRegex);
  if (!tags || tags.length <= 1) return body;

  const offset = seed % tags.length;
  const rotated = [...tags.slice(offset), ...tags.slice(0, offset)];
  let idx = 0;
  return body.replace(hashtagRegex, () => rotated[idx++] || "");
}

/**
 * Selects the next text variation for a post if configured.
 */
export function pickNextVariation(
  defaultBody: string,
  variationsJson?: string | null,
  recycleCount = 0,
): string {
  if (!variationsJson) return defaultBody;
  try {
    const parsed = JSON.parse(variationsJson);
    if (Array.isArray(parsed) && parsed.length > 0) {
      const entry = parsed[recycleCount % parsed.length];
      if (typeof entry === "string" && entry.trim().length > 0) {
        return entry.trim();
      }
      if (entry && typeof entry === "object" && entry.body) {
        return String(entry.body).trim();
      }
    }
  } catch {}
  return defaultBody;
}

/**
 * Checks if post engagement has dropped below the exhaustion threshold.
 */
export function isExhaustedByEngagement(
  metrics: { engagementRate?: number }[],
  minEngagementRate?: number | null,
): boolean {
  if (minEngagementRate === undefined || minEngagementRate === null || minEngagementRate <= 0) return false;
  if (!metrics || metrics.length === 0) return false;
  const latestRate = metrics[0]?.engagementRate ?? 0;
  return latestRate < minEngagementRate;
}
