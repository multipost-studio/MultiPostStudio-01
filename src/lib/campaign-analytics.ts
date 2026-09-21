export interface CampaignPostInput {
  id: string;
  status: string;
  channels: { platform: string }[];
  metrics: {
    impressions?: number;
    reach?: number;
    likes?: number;
    comments?: number;
    shares?: number;
    saves?: number;
    clicks?: number;
    videoViews?: number;
    engagementRate?: number;
  }[];
}

export interface CampaignMetaInput {
  startDate?: Date | string | null;
  endDate?: Date | string | null;
  goalPosts?: number | null;
  goalEngagement?: number | null;
  kpiTarget?: number | null;
  kpiMetric?: string | null;
  budgetCents?: number | null;
  revenueCents?: number | null;
  conversions?: number | null;
}

export interface ChannelPerformance {
  platform: string;
  postsCount: number;
  impressions: number;
  reach: number;
  engagement: number;
  clicks: number;
  videoViews: number;
  engagementRate: number;
}

export interface CampaignAnalyticsRollup {
  totalPosts: number;
  publishedPosts: number;
  scheduledPosts: number;
  draftPosts: number;
  impressions: number;
  reach: number;
  engagement: number;
  clicks: number;
  videoViews: number;
  averageEngagementRate: number;
  channelBreakdown: ChannelPerformance[];
  budget: number;
  revenue: number;
  conversions: number;
  roiPct: number | null;
  cpa: number | null;
  cpc: number | null;
  postProgressPct: number | null;
  engagementProgressPct: number | null;
  kpiProgressPct: number | null;
  kpiCurrent: number;
  durationDays: number | null;
  daysRemaining: number | null;
  pacingStatus: "not_started" | "on_track" | "ahead" | "behind" | "completed";
}

export function formatKpiMetricLabel(metric?: string | null): string {
  if (!metric) return "Custom KPI";
  switch (metric.toLowerCase()) {
    case "clicks":
      return "Link Clicks";
    case "impressions":
      return "Total Impressions";
    case "reach":
      return "Audience Reach";
    case "engagement":
    case "engagements":
      return "Total Engagement";
    case "conversions":
      return "Conversions";
    case "leads":
      return "Leads Generated";
    case "video_views":
    case "videoviews":
      return "Video Views";
    default:
      return metric.charAt(0).toUpperCase() + metric.slice(1);
  }
}

export function calculateCampaignRollup(
  campaign: CampaignMetaInput,
  posts: CampaignPostInput[],
  referenceDate: Date = new Date(),
): CampaignAnalyticsRollup {
  const totalPosts = posts.length;
  let publishedPosts = 0;
  let scheduledPosts = 0;
  let draftPosts = 0;

  let impressions = 0;
  let reach = 0;
  let engagement = 0;
  let clicks = 0;
  let videoViews = 0;

  const channelMap = new Map<string, ChannelPerformance>();

  for (const post of posts) {
    if (post.status === "published") publishedPosts++;
    else if (post.status === "scheduled" || post.status === "approved") scheduledPosts++;
    else draftPosts++;

    // Sum post metrics
    let postImpressions = 0;
    let postReach = 0;
    let postEngagement = 0;
    let postClicks = 0;
    let postVideoViews = 0;

    for (const m of post.metrics) {
      postImpressions += m.impressions ?? 0;
      postReach += m.reach ?? 0;
      postClicks += m.clicks ?? 0;
      postVideoViews += m.videoViews ?? 0;
      postEngagement += (m.likes ?? 0) + (m.comments ?? 0) + (m.shares ?? 0) + (m.saves ?? 0);
    }

    impressions += postImpressions;
    reach += postReach;
    clicks += postClicks;
    videoViews += postVideoViews;
    engagement += postEngagement;

    // Platform distribution
    const platforms = new Set(post.channels.map((c) => c.platform.toLowerCase()));
    for (const plat of platforms) {
      const existing = channelMap.get(plat) ?? {
        platform: plat,
        postsCount: 0,
        impressions: 0,
        reach: 0,
        engagement: 0,
        clicks: 0,
        videoViews: 0,
        engagementRate: 0,
      };

      existing.postsCount += 1;
      // Distribute metrics across active channels for the post (avoiding over-counting)
      const share = platforms.size > 0 ? 1 / platforms.size : 1;
      existing.impressions += Math.round(postImpressions * share);
      existing.reach += Math.round(postReach * share);
      existing.engagement += Math.round(postEngagement * share);
      existing.clicks += Math.round(postClicks * share);
      existing.videoViews += Math.round(postVideoViews * share);
      channelMap.set(plat, existing);
    }
  }

  // Calculate per-channel engagement rates
  const channelBreakdown: ChannelPerformance[] = Array.from(channelMap.values()).map((c) => {
    const rate = c.impressions > 0 ? (c.engagement / c.impressions) * 100 : 0;
    return {
      ...c,
      engagementRate: Math.round(rate * 10) / 10,
    };
  });

  const averageEngagementRate = impressions > 0 ? Math.round((engagement / impressions) * 1000) / 10 : 0;

  // Financials & ROI
  const budget = campaign.budgetCents ?? 0;
  const revenue = campaign.revenueCents ?? 0;
  const conversions = campaign.conversions ?? 0;

  const roiPct = budget > 0 ? Math.round(((revenue - budget) / budget) * 100) : null;
  const cpa = conversions > 0 && budget > 0 ? Math.round(budget / conversions) : null;
  const cpc = clicks > 0 && budget > 0 ? Math.round(budget / clicks) : null;

  // Goals
  const postProgressPct =
    campaign.goalPosts && campaign.goalPosts > 0
      ? Math.min(100, Math.round((totalPosts / campaign.goalPosts) * 100))
      : null;

  const engagementProgressPct =
    campaign.goalEngagement && campaign.goalEngagement > 0
      ? Math.min(100, Math.round((engagement / campaign.goalEngagement) * 100))
      : null;

  // Custom KPI calculation
  let kpiCurrent = 0;
  const kpiMetricKey = campaign.kpiMetric ? campaign.kpiMetric.toLowerCase() : "";
  switch (kpiMetricKey) {
    case "clicks":
      kpiCurrent = clicks;
      break;
    case "impressions":
      kpiCurrent = impressions;
      break;
    case "reach":
      kpiCurrent = reach;
      break;
    case "engagement":
    case "engagements":
      kpiCurrent = engagement;
      break;
    case "conversions":
      kpiCurrent = conversions;
      break;
    case "video_views":
    case "videoviews":
      kpiCurrent = videoViews;
      break;
    default:
      kpiCurrent = clicks > 0 ? clicks : engagement;
  }

  const kpiProgressPct =
    campaign.kpiTarget && campaign.kpiTarget > 0
      ? Math.min(100, Math.round((kpiCurrent / campaign.kpiTarget) * 100))
      : null;

  // Duration & Timeline
  const start = campaign.startDate ? new Date(campaign.startDate) : null;
  const end = campaign.endDate ? new Date(campaign.endDate) : null;

  let durationDays: number | null = null;
  let daysRemaining: number | null = null;
  let pacingStatus: CampaignAnalyticsRollup["pacingStatus"] = "on_track";

  if (start && end) {
    durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    daysRemaining = Math.round((end.getTime() - referenceDate.getTime()) / 86_400_000);

    if (referenceDate < start) {
      pacingStatus = "not_started";
    } else if (referenceDate > end) {
      pacingStatus = "completed";
    } else {
      const elapsedDays = Math.max(1, Math.round((referenceDate.getTime() - start.getTime()) / 86_400_000));
      const expectedProgress = Math.min(1, elapsedDays / durationDays);

      const actualProgress =
        kpiProgressPct !== null
          ? kpiProgressPct / 100
          : postProgressPct !== null
          ? postProgressPct / 100
          : null;

      if (actualProgress !== null) {
        if (actualProgress >= expectedProgress * 1.1) {
          pacingStatus = "ahead";
        } else if (actualProgress < expectedProgress * 0.75) {
          pacingStatus = "behind";
        } else {
          pacingStatus = "on_track";
        }
      }
    }
  }

  return {
    totalPosts,
    publishedPosts,
    scheduledPosts,
    draftPosts,
    impressions,
    reach,
    engagement,
    clicks,
    videoViews,
    averageEngagementRate,
    channelBreakdown,
    budget,
    revenue,
    conversions,
    roiPct,
    cpa,
    cpc,
    postProgressPct,
    engagementProgressPct,
    kpiProgressPct,
    kpiCurrent,
    durationDays,
    daysRemaining,
    pacingStatus,
  };
}
