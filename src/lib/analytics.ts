import { db } from "@/lib/db";

export type Range = 7 | 14 | 30 | 90;

export async function getAnalytics(workspaceId: string, days: Range = 30) {
  const since = new Date(Date.now() - days * 86_400_000);
  const prevSince = new Date(Date.now() - days * 2 * 86_400_000);

  const [snapshots, channels, publishedPosts, campaigns, pillars, health] = await Promise.all([
    db.metricSnapshot.findMany({
      where: { workspaceId, channelId: null, date: { gte: prevSince } },
      orderBy: { date: "asc" },
    }),
    db.socialChannel.findMany({ where: { workspaceId } }),
    db.post.findMany({
      where: { workspaceId, status: "published", publishedAt: { gte: since } },
      include: { metrics: true, channels: true, pillar: true, campaign: true },
    }),
    db.campaign.findMany({ where: { workspaceId } }),
    db.contentPillar.findMany({ where: { workspaceId } }),
    db.healthScore.findFirst({ where: { workspaceId }, orderBy: { date: "desc" } }),
  ]);

  const cur = snapshots.filter((s) => s.date >= since);
  const prev = snapshots.filter((s) => s.date < since);

  const sum = (arr: typeof snapshots, k: keyof (typeof snapshots)[number]) =>
    arr.reduce((n, s) => n + (s[k] as number), 0);

  const delta = (a: number, b: number) => (b ? ((a - b) / b) * 100 : 0);

  const followersNow = cur.at(-1)?.followers ?? 0;
  const followersStart = cur[0]?.followers ?? followersNow;
  const followersPrevStart = prev[0]?.followers ?? followersStart;

  const totals = {
    followers: followersNow,
    followerGrowth: followersNow - followersStart,
    reach: sum(cur, "reach"),
    impressions: sum(cur, "impressions"),
    engagement: sum(cur, "engagement"),
    clicks: sum(cur, "clicks"),
    videoViews: sum(cur, "videoViews"),
    shares: sum(cur, "shares"),
    saves: sum(cur, "saves"),
    comments: sum(cur, "comments"),
  };
  const engagementRate = totals.impressions ? (totals.engagement / totals.impressions) * 100 : 0;

  const deltas = {
    followerGrowth: delta(followersNow - followersStart, followersStart - followersPrevStart),
    reach: delta(sum(cur, "reach"), sum(prev, "reach")),
    impressions: delta(sum(cur, "impressions"), sum(prev, "impressions")),
    engagement: delta(sum(cur, "engagement"), sum(prev, "engagement")),
    engagementRate: delta(
      totals.impressions ? totals.engagement / totals.impressions : 0,
      sum(prev, "impressions") ? sum(prev, "engagement") / sum(prev, "impressions") : 0,
    ),
  };

  const series = cur.map((s) => ({
    label: s.date.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    followers: s.followers,
    reach: s.reach,
    impressions: s.impressions,
    engagement: s.engagement,
  }));

  // Post-level rollups
  const postRows = publishedPosts.map((p) => {
    const m = p.metrics.reduce(
      (acc, x) => ({
        impressions: acc.impressions + x.impressions,
        engagement: acc.engagement + x.likes + x.comments + x.shares + x.saves,
        saves: acc.saves + x.saves,
        clicks: acc.clicks + x.clicks,
      }),
      { impressions: 0, engagement: 0, saves: 0, clicks: 0 },
    );
    return {
      id: p.id,
      title: p.title ?? p.channels[0]?.body?.slice(0, 50) ?? "Untitled",
      platform: p.channels[0]?.platform ?? "—",
      pillar: p.pillar?.name ?? "Uncategorized",
      campaign: p.campaign?.name ?? null,
      publishedAt: p.publishedAt?.toISOString() ?? "",
      ...m,
      engagementRate: m.impressions ? (m.engagement / m.impressions) * 100 : 0,
    };
  });

  const topPosts = [...postRows].sort((a, b) => b.engagementRate - a.engagementRate).slice(0, 5);
  const worstPosts = [...postRows].sort((a, b) => a.engagementRate - b.engagementRate).slice(0, 5);

  const byPillar = pillars.map((pl) => {
    const rows = postRows.filter((r) => r.pillar === pl.name);
    return {
      name: pl.name,
      color: pl.color,
      posts: rows.length,
      avgEngagementRate: rows.length ? rows.reduce((n, r) => n + r.engagementRate, 0) / rows.length : 0,
      saves: rows.reduce((n, r) => n + r.saves, 0),
    };
  });

  const byPlatform = [...new Set(postRows.map((r) => r.platform))].map((plat) => {
    const rows = postRows.filter((r) => r.platform === plat);
    return {
      platform: plat,
      posts: rows.length,
      impressions: rows.reduce((n, r) => n + r.impressions, 0),
      engagement: rows.reduce((n, r) => n + r.engagement, 0),
      avgEngagementRate: rows.length ? rows.reduce((n, r) => n + r.engagementRate, 0) / rows.length : 0,
    };
  });

  const byCampaign = campaigns.map((c) => {
    const rows = postRows.filter((r) => r.campaign === c.name);
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      status: c.status,
      posts: rows.length,
      engagement: rows.reduce((n, r) => n + r.engagement, 0),
      goalPosts: c.goalPosts,
    };
  });

  return {
    days,
    totals,
    deltas,
    engagementRate,
    series,
    channels: channels.map((c) => ({ id: c.id, name: c.name, platform: c.platform, followers: c.followerCount })),
    topPosts,
    worstPosts,
    byPillar,
    byPlatform,
    byCampaign,
    postCount: postRows.length,
    health,
  };
}
