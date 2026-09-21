/**
 * Visual Report Builder Data Model & Config Normalizer
 */

export const REPORT_WIDGET_KEYS = [
  "followers_growth",
  "reach_impressions",
  "engagement_rate",
  "top_posts",
  "worst_posts",
  "engagement_by_format",
  "platform_comparison",
  "campaign_performance",
  "posting_frequency",
  "executive_summary",
] as const;

export type ReportWidgetKey = (typeof REPORT_WIDGET_KEYS)[number];

export interface ReportWidgetDefinition {
  key: ReportWidgetKey;
  label: string;
  category: "overview" | "content" | "channels" | "narrative";
  description: string;
  defaultIncluded: boolean;
}

export const REPORT_WIDGETS_METADATA: ReportWidgetDefinition[] = [
  {
    key: "executive_summary",
    label: "Executive Summary",
    category: "narrative",
    description: "High-level AI or agency narrative synthesizing overall campaign performance.",
    defaultIncluded: true,
  },
  {
    key: "followers_growth",
    label: "Follower Growth",
    category: "overview",
    description: "Net follower gains and velocity over the selected reporting window.",
    defaultIncluded: true,
  },
  {
    key: "reach_impressions",
    label: "Reach & Impressions",
    category: "overview",
    description: "Total visibility, feed impressions, and period-over-period expansion.",
    defaultIncluded: true,
  },
  {
    key: "engagement_rate",
    label: "Engagement Rate",
    category: "overview",
    description: "Benchmark interaction ratios across all active social profiles.",
    defaultIncluded: true,
  },
  {
    key: "top_posts",
    label: "Top Performing Posts",
    category: "content",
    description: "Ranked list of highest-converting and most viral content published.",
    defaultIncluded: true,
  },
  {
    key: "worst_posts",
    label: "Underperforming Posts",
    category: "content",
    description: "Posts needing editorial attention or timing adjustments.",
    defaultIncluded: false,
  },
  {
    key: "engagement_by_format",
    label: "Format Efficiency",
    category: "content",
    description: "Comparison of Carousels, Short Video/Reels, Single Images, and Text.",
    defaultIncluded: true,
  },
  {
    key: "platform_comparison",
    label: "Platform Breakdown",
    category: "channels",
    description: "Channel share of voice, reach distribution, and cross-platform ER.",
    defaultIncluded: true,
  },
  {
    key: "campaign_performance",
    label: "Campaign Attribution",
    category: "content",
    description: "Rollup of specific promotional objectives and goal progress.",
    defaultIncluded: false,
  },
  {
    key: "posting_frequency",
    label: "Posting Heatmap & Cadence",
    category: "overview",
    description: "Day-by-hour distribution showing consistency and optimal posting windows.",
    defaultIncluded: false,
  },
];

export interface ReportBrandingConfig {
  logo?: boolean;
  agencyName?: string;
  primaryColor?: string;
}

export interface CustomReportConfig {
  dateRange: "last_7_days" | "last_30_days" | "last_90_days" | "this_month";
  widgets: ReportWidgetKey[];
  layout: "single" | "grid";
  executiveSummary?: string;
  branding?: ReportBrandingConfig;
  platforms?: string[];
}

export function getDefaultReportConfig(): CustomReportConfig {
  return {
    dateRange: "last_30_days",
    widgets: REPORT_WIDGETS_METADATA.filter((w) => w.defaultIncluded).map((w) => w.key),
    layout: "grid",
    executiveSummary: "Monthly cross-platform social performance digest and executive analysis.",
    branding: {
      logo: false,
      primaryColor: "#6366f1",
    },
    platforms: ["all"],
  };
}

export function validateReportConfig(input: unknown): {
  valid: boolean;
  errors: string[];
  sanitized: CustomReportConfig;
} {
  const errors: string[] = [];
  const fallback = getDefaultReportConfig();

  if (!input || typeof input !== "object") {
    return { valid: false, errors: ["Config must be an object"], sanitized: fallback };
  }

  const raw = input as Record<string, unknown>;

  const dateRanges = ["last_7_days", "last_30_days", "last_90_days", "this_month"];
  const dateRange =
    typeof raw.dateRange === "string" && dateRanges.includes(raw.dateRange)
      ? (raw.dateRange as CustomReportConfig["dateRange"])
      : fallback.dateRange;

  const layout = raw.layout === "single" || raw.layout === "grid" ? raw.layout : fallback.layout;

  let widgets: ReportWidgetKey[] = fallback.widgets;
  if (Array.isArray(raw.widgets)) {
    const filtered = raw.widgets.filter((w): w is ReportWidgetKey =>
      REPORT_WIDGET_KEYS.includes(w as ReportWidgetKey),
    );
    if (filtered.length > 0) {
      widgets = filtered;
    } else {
      errors.push("At least one valid widget must be included in the report");
    }
  }

  const executiveSummary =
    typeof raw.executiveSummary === "string" ? raw.executiveSummary.slice(0, 1000) : fallback.executiveSummary;

  let branding = fallback.branding;
  if (raw.branding && typeof raw.branding === "object") {
    const b = raw.branding as Record<string, unknown>;
    branding = {
      logo: typeof b.logo === "boolean" ? b.logo : false,
      agencyName: typeof b.agencyName === "string" ? b.agencyName.slice(0, 80) : undefined,
      primaryColor: typeof b.primaryColor === "string" && /^#[0-9a-fA-F]{6}$/.test(b.primaryColor)
        ? b.primaryColor
        : "#6366f1",
    };
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized: {
      dateRange,
      widgets,
      layout,
      executiveSummary,
      branding,
      platforms: Array.isArray(raw.platforms) ? raw.platforms.map(String) : ["all"],
    },
  };
}
