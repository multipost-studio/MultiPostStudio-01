import { db } from "@/lib/db";
import { readToken } from "@/lib/social/crypto";
import { parseJson } from "@/lib/utils";
import { blueskyGetProfile } from "@/lib/social/bluesky";
import { logger } from "@/lib/logger";

/**
 * Daily rollup that feeds the dashboard and analytics: real follower counts
 * from the platform, one MetricSnapshot per channel + a workspace aggregate,
 * a recomputed HealthScore, and refreshed ContentGoal progress. Every number
 * is measured — dimensions with no signal yet are 0, never invented.
 *
 * Called from the cron tick; runs at most once per workspace per day.
 */

const DAY = 86_400_000;
const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));

function startOfToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Refresh a channel's real follower count from its platform, where supported. */
async function refreshFollowers(channelId: string): Promise<number | null> {
  const ch = await db.socialChannel.findUnique({
    where: { id: channelId },
    include: { socialAccount: true },
  });
  if (!ch) return null;
  const acc = ch.socialAccount;

  try {
    if (acc.platform === "bluesky") {
      const meta = parseJson<{ did?: string; pds?: string }>(acc.metadata, {});
      const jwt = readToken(acc.accessToken);
      if (!meta.did || !jwt) return null;
      const p = await blueskyGetProfile(meta.did, jwt, meta.pds);
      await db.socialChannel.update({
        where: { id: ch.id },
        data: { followerCount: p.followersCount, avatarUrl: p.avatar ?? ch.avatarUrl },
      });
      return p.followersCount;
    }
    // Other platforms: follower sync not wired yet — keep the stored value.
    return ch.followerCount;
  } catch (e) {
    logger.warn({ err: e, channelId }, "follower refresh failed");
    return ch.followerCount;
  }
}

export async function rollupWorkspace(workspaceId: string): Promise<void> {
  const today = startOfToday();

  // Idempotent: skip if today's aggregate snapshot already exists.
  const existing = await db.metricSnapshot.findFirst({
    where: { workspaceId, channelId: null, date: { gte: today } },
    select: { id: true },
  });
  if (existing) return;

  const channels = await db.socialChannel.findMany({ where: { workspaceId } });
  if (channels.length === 0) return;

  // Per-channel engagement for today's published posts (real PostMetric only).
  const perChannel: Record<
    string,
    { reach: number; impressions: number; engagement: number; clicks: number; videoViews: number; shares: number; saves: number; comments: number }
  > = {};
  for (const ch of channels) {
    const metrics = await db.postMetric.findMany({
      where: {
        postChannel: { channelId: ch.id },
        capturedAt: { gte: new Date(Date.now() - DAY) },
      },
    });
    perChannel[ch.id] = metrics.reduce(
      (a, m) => ({
        reach: a.reach + m.reach,
        impressions: a.impressions + m.impressions,
        engagement: a.engagement + m.likes + m.comments + m.shares + m.saves,
        clicks: a.clicks + m.clicks,
        videoViews: a.videoViews + m.videoViews,
        shares: a.shares + m.shares,
        saves: a.saves + m.saves,
        comments: a.comments + m.comments,
      }),
      { reach: 0, impressions: 0, engagement: 0, clicks: 0, videoViews: 0, shares: 0, saves: 0, comments: 0 },
    );
  }

  // Write one snapshot per channel + a workspace aggregate.
  const agg = { followers: 0, reach: 0, impressions: 0, engagement: 0, clicks: 0, videoViews: 0, shares: 0, saves: 0, comments: 0 };
  for (const ch of channels) {
    const followers = (await refreshFollowers(ch.id)) ?? ch.followerCount;
    const m = perChannel[ch.id];
    await db.metricSnapshot.create({
      data: { workspaceId, channelId: ch.id, date: today, followers, ...m },
    });
    agg.followers += followers;
    agg.reach += m.reach;
    agg.impressions += m.impressions;
    agg.engagement += m.engagement;
    agg.clicks += m.clicks;
    agg.videoViews += m.videoViews;
    agg.shares += m.shares;
    agg.saves += m.saves;
    agg.comments += m.comments;
  }
  await db.metricSnapshot.create({ data: { workspaceId, channelId: null, date: today, ...agg } });

  await recomputeHealth(workspaceId, agg);
  await refreshGoals(workspaceId, agg);
}

/** Health score from real signals. Dimensions with no data are 0. */
async function recomputeHealth(
  workspaceId: string,
  today: { followers: number; engagement: number; impressions: number },
): Promise<void> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const twoWeeksAgo = new Date(now - 14 * DAY);

  const [postsThisWeek, goal, pillarsUsed, pillarsTotal, convos, prevSnap] = await Promise.all([
    db.post.count({ where: { workspaceId, status: "published", publishedAt: { gte: weekAgo } } }),
    db.contentGoal.findFirst({ where: { workspaceId, metric: "posts_per_week" } }),
    db.post
      .findMany({
        where: { workspaceId, status: "published", publishedAt: { gte: new Date(now - 30 * DAY) }, pillarId: { not: null } },
        select: { pillarId: true },
        distinct: ["pillarId"],
      })
      .then((r) => r.length),
    db.contentPillar.count({ where: { workspaceId } }),
    db.conversation.findMany({
      where: {
        workspaceId,
        createdAt: { gte: new Date(now - 30 * DAY) },
        messages: { some: { direction: "outbound" } },
      },
      select: {
        createdAt: true,
        messages: {
          where: { direction: "outbound" },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { createdAt: true },
        },
      },
      take: 200,
    }),
    db.metricSnapshot.findFirst({
      where: { workspaceId, channelId: null, date: { gte: twoWeeksAgo, lt: weekAgo } },
      orderBy: { date: "desc" },
    }),
  ]);

  const targetPerWeek = goal?.target || 5;
  const consistency = clamp((postsThisWeek / targetPerWeek) * 100);

  const engRate = today.impressions > 0 ? today.engagement / today.impressions : 0;
  const engagement = clamp(engRate * 100 * 20); // 5% eng rate -> 100

  const prevFollowers = prevSnap?.followers ?? today.followers;
  const growthPct = prevFollowers > 0 ? ((today.followers - prevFollowers) / prevFollowers) * 100 : 0;
  const growth = clamp(50 + growthPct * 10); // +5%/wk -> 100, -5% -> 0

  let responseSpeed = 0;
  const replied = convos.filter((c) => c.messages[0]);
  if (replied.length > 0) {
    const avgHours =
      replied.reduce(
        (a, c) => a + (c.messages[0]!.createdAt.getTime() - c.createdAt.getTime()) / 3_600_000,
        0,
      ) / replied.length;
    responseSpeed = clamp(100 - avgHours * 4); // <1h -> ~96, 24h -> 4
  }

  const diversity = pillarsTotal > 0 ? clamp((pillarsUsed / pillarsTotal) * 100) : 0;

  // Score = mean of the dimensions that actually have a signal.
  const dims = [
    postsThisWeek > 0 ? consistency : null,
    today.impressions > 0 ? engagement : null,
    prevSnap ? growth : null,
    replied.length > 0 ? responseSpeed : null,
    pillarsTotal > 0 && pillarsUsed > 0 ? diversity : null,
  ].filter((x): x is number => x !== null);
  const score = dims.length ? clamp(dims.reduce((a, b) => a + b, 0) / dims.length) : 0;

  const prevHealth = await db.healthScore.findFirst({
    where: { workspaceId, date: { lt: startOfToday() } },
    orderBy: { date: "desc" },
  });
  const trend = prevHealth ? score - prevHealth.score : 0;

  await db.healthScore.create({
    data: {
      workspaceId,
      date: startOfToday(),
      score,
      consistency,
      engagement,
      growth,
      responseSpeed,
      diversity,
      trend,
    },
  });
}

/** Point each ContentGoal.current at the real current-period number. */
async function refreshGoals(
  workspaceId: string,
  today: { followers: number; engagement: number; impressions: number },
): Promise<void> {
  const goals = await db.contentGoal.findMany({ where: { workspaceId } });
  if (goals.length === 0) return;

  const now = Date.now();
  for (const g of goals) {
    const span = g.period === "monthly" ? 30 * DAY : 7 * DAY;
    const since = new Date(now - span);
    let current = g.current;

    if (g.metric === "posts_per_week") {
      current = await db.post.count({ where: { workspaceId, status: "published", publishedAt: { gte: since } } });
    } else if (g.metric === "follower_growth") {
      const start = await db.metricSnapshot.findFirst({
        where: { workspaceId, channelId: null, date: { gte: since } },
        orderBy: { date: "asc" },
      });
      current = Math.max(0, today.followers - (start?.followers ?? today.followers));
    } else if (g.metric === "engagement_rate") {
      current = today.impressions > 0 ? Number(((today.engagement / today.impressions) * 100).toFixed(2)) : 0;
    } else if (g.metric === "campaign") {
      current = await db.campaign.count({ where: { workspaceId, status: "active" } });
    }

    if (current !== g.current) {
      await db.contentGoal.update({ where: { id: g.id }, data: { current } });
    }
  }
}

/** Run the rollup for every workspace that has at least one channel. */
export async function runMetricsRollup(): Promise<{ workspaces: number }> {
  const wss = await db.socialChannel.findMany({ select: { workspaceId: true }, distinct: ["workspaceId"] });
  let n = 0;
  for (const { workspaceId } of wss) {
    try {
      await rollupWorkspace(workspaceId);
      n++;
    } catch (e) {
      logger.warn({ err: e, workspaceId }, "metrics rollup failed");
    }
  }
  return { workspaces: n };
}
