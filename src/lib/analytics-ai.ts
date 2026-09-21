/**
 * AI Analytics Period Summarizer & Performance Synthesizer
 */

export interface AnalyticsBrief {
  summary: string;
  highlights: string[];
  recommendations: string[];
  topPlatform?: string | null;
  topFormat?: string | null;
}

export function synthesizeAnalyticsBrief(a: {
  days: number;
  totals: { followers: number; reach: number; impressions: number; engagement: number };
  deltas: { followerGrowth: number; reach: number; impressions: number; engagementRate: number };
  engagementRate: number;
  postCount: number;
  byFormat: { format: string; posts: number; avgEngagementRate: number; impressions: number }[];
  byPlatform: { platform: string; posts: number; engagement: number; avgEngagementRate: number }[];
  bestSlots: { day: number; hour: number; value: number }[];
}): AnalyticsBrief {
  if (a.postCount === 0 && a.totals.impressions === 0) {
    return {
      summary: `Insufficient activity observed during this ${a.days}-day window. Publish posts across your channels to begin collecting comparative performance intelligence.`,
      highlights: [],
      recommendations: [
        "Connect at least two social channels to enable cross-platform benchmarking.",
        "Maintain a minimum cadence of 3 posts per week to stabilize algorithm reach.",
      ],
    };
  }

  const daysLabel = `${a.days} days`;
  const erFormatted = `${a.engagementRate.toFixed(1)}%`;
  const followerGrowthDir = a.deltas.followerGrowth >= 0 ? "+" : "";

  // Identify top platform by engagement rate
  const sortedPlatforms = [...a.byPlatform].sort((x, y) => y.avgEngagementRate - x.avgEngagementRate);
  const topPlatform = sortedPlatforms[0]?.platform ?? null;

  // Identify top format
  const sortedFormats = [...a.byFormat].sort((x, y) => y.avgEngagementRate - x.avgEngagementRate);
  const topFormat = sortedFormats[0]?.format ?? null;

  const highlights: string[] = [
    `Total reach of ${a.totals.reach.toLocaleString()} with ${a.totals.impressions.toLocaleString()} impressions across ${a.postCount} published posts.`,
    `Average engagement rate of ${erFormatted} (${a.deltas.engagementRate >= 0 ? "+" : ""}${a.deltas.engagementRate.toFixed(1)}% period-over-period).`,
    `Audience growth trended at ${followerGrowthDir}${a.deltas.followerGrowth.toFixed(1)}% relative to the prior ${daysLabel}.`,
  ];

  if (topPlatform) {
    highlights.push(
      `${topPlatform.toUpperCase()} was your highest-yielding channel with an average ${sortedPlatforms[0].avgEngagementRate.toFixed(1)}% engagement rate.`
    );
  }

  const recommendations: string[] = [];

  if (topFormat && topFormat !== "Text") {
    recommendations.push(
      `Increase production of ${topFormat} content — it outperformed other formats with a ${sortedFormats[0].avgEngagementRate.toFixed(1)}% ER.`
    );
  }

  if (a.bestSlots.length > 0 && a.bestSlots[0].value > 0) {
    const daysArr = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const best = a.bestSlots[0];
    recommendations.push(
      `Schedule prime announcements around ${daysArr[best.day]} at ${best.hour}:00, your highest historical engagement window.`
    );
  } else {
    recommendations.push(
      `Experiment with varied publishing times across morning and late afternoon to establish peak audience engagement slots.`
    );
  }

  if (a.postCount < a.days / 5) {
    recommendations.push(
      `Your current cadence (${a.postCount} posts in ${daysLabel}) is light. Raising volume to 3–5 weekly posts will expand discoverability.`
    );
  }

  return {
    summary: `Performance overview for the last ${daysLabel}: your content engaged ${a.totals.engagement.toLocaleString()} interactions at a ${erFormatted} rate.`,
    highlights,
    recommendations,
    topPlatform,
    topFormat,
  };
}
