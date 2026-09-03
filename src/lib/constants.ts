// Central product constants: platforms, roles, permissions, plans, nav.

export const PLATFORMS = {
  instagram: { label: "Instagram", limit: 2200, color: "#d6336c", supportsFirstComment: true, media: "required" },
  facebook: { label: "Facebook", limit: 63206, color: "#1877f2", supportsFirstComment: true, media: "optional" },
  linkedin: { label: "LinkedIn", limit: 3000, color: "#0a66c2", supportsFirstComment: true, media: "optional" },
  x: { label: "X", limit: 280, color: "#111827", supportsFirstComment: false, media: "optional" },
  tiktok: { label: "TikTok", limit: 2200, color: "#111827", supportsFirstComment: false, media: "required" },
  youtube: { label: "YouTube", limit: 5000, color: "#ff0000", supportsFirstComment: true, media: "required" },
  pinterest: { label: "Pinterest", limit: 500, color: "#e60023", supportsFirstComment: false, media: "required" },
  threads: { label: "Threads", limit: 500, color: "#111827", supportsFirstComment: false, media: "optional" },
  gbp: { label: "Google Business", limit: 1500, color: "#4285f4", supportsFirstComment: false, media: "optional" },
  bluesky: { label: "Bluesky", limit: 300, color: "#0085ff", supportsFirstComment: false, media: "optional" },
} as const;

export type PlatformKey = keyof typeof PLATFORMS;
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

export const ORG_ROLES = ["owner", "admin", "manager", "editor", "creator", "analyst", "viewer"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const WORKSPACE_ROLES = ["manager", "editor", "creator", "analyst", "viewer", "client"] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  editor: "Editor",
  creator: "Creator",
  analyst: "Analyst",
  viewer: "Viewer",
  client: "Client",
};

export const IDEA_STAGES = [
  "idea",
  "researching",
  "drafting",
  "review",
  "approved",
  "scheduled",
  "published",
] as const;
export type IdeaStage = (typeof IDEA_STAGES)[number];

export const IDEA_STAGE_LABELS: Record<IdeaStage, string> = {
  idea: "Ideas",
  researching: "Researching",
  drafting: "Drafting",
  review: "Review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

export const POST_STATUS = [
  "draft",
  "awaiting_approval",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "archived",
] as const;
export type PostStatus = (typeof POST_STATUS)[number];

export const POST_STATUS_META: Record<PostStatus, { label: string; tone: string; icon: string }> = {
  draft: { label: "Draft", tone: "neutral", icon: "pencil" },
  awaiting_approval: { label: "Awaiting approval", tone: "warning", icon: "clock" },
  approved: { label: "Approved", tone: "info", icon: "check" },
  scheduled: { label: "Scheduled", tone: "info", icon: "calendar" },
  publishing: { label: "Publishing", tone: "warning", icon: "loader" },
  published: { label: "Published", tone: "success", icon: "check-circle" },
  failed: { label: "Failed", tone: "danger", icon: "alert" },
  archived: { label: "Archived", tone: "neutral", icon: "archive" },
};

export const GOALS = [
  { key: "grow_followers", label: "Grow followers" },
  { key: "save_time", label: "Save time" },
  { key: "increase_engagement", label: "Increase engagement" },
  { key: "generate_leads", label: "Generate leads" },
  { key: "manage_clients", label: "Manage clients" },
  { key: "content_consistency", label: "Improve content consistency" },
] as const;

export const INDUSTRIES = [
  "SaaS / Technology",
  "E-commerce / Retail",
  "Agency / Marketing",
  "Media / Publishing",
  "Health / Wellness",
  "Finance / Fintech",
  "Education",
  "Nonprofit",
  "Food & Beverage",
  "Travel / Hospitality",
  "Real Estate",
  "Entertainment",
  "Other",
];

export const AI_TONES = [
  "Professional",
  "Friendly",
  "Luxury",
  "Funny",
  "Educational",
  "Bold",
  "Casual",
  "Brand voice",
] as const;

export const PLAN_KEYS = ["free", "pro", "team", "agency", "enterprise"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

/**
 * Capability entitlements. A plan's `entitlements` JSON array holds the keys it
 * grants. Read at runtime via src/lib/entitlements.ts — never hardcode feature
 * access against a plan key.
 */
export const ENTITLEMENT_GROUPS = [
  {
    group: "Publishing",
    items: [
      ["scheduling", "Scheduling"],
      ["bulk_scheduling", "Bulk scheduling"],
      ["csv_import", "CSV import"],
      ["recurring_posts", "Recurring posts"],
      ["content_calendar", "Content calendar"],
      ["queue", "Content queues"],
      ["first_comment", "First comment"],
      ["drafts", "Drafts"],
      ["evergreen_recycling", "Evergreen recycling"],
    ],
  },
  {
    group: "Platforms",
    items: [
      ["platform_instagram", "Instagram"],
      ["platform_facebook", "Facebook"],
      ["platform_linkedin", "LinkedIn"],
      ["platform_x", "X / Twitter"],
      ["platform_tiktok", "TikTok"],
      ["platform_youtube", "YouTube"],
      ["platform_pinterest", "Pinterest"],
      ["platform_threads", "Threads"],
      ["platform_bluesky", "Bluesky"],
      ["platform_gbp", "Google Business"],
    ],
  },
  {
    group: "AI",
    items: [
      ["ai_writer", "AI caption writer"],
      ["ai_image", "AI image generation"],
      ["ai_video", "AI video generation"],
      ["ai_hashtags", "AI hashtag generation"],
      ["ai_ideas", "AI content ideas"],
      ["ai_repurpose", "AI repurposing (long-form → social)"],
      ["ai_best_time", "AI best-time-to-post"],
      ["ai_variations", "AI variations"],
      ["ai_content_score", "AI content scoring"],
      ["ai_recommendations", "AI performance recommendations"],
    ],
  },
  {
    group: "Analytics",
    items: [
      ["analytics_basic", "Basic analytics"],
      ["analytics_advanced", "Advanced analytics"],
      ["audience_analytics", "Audience analytics"],
      ["competitor_analytics", "Competitor analytics"],
      ["report_builder", "Report builder"],
      ["scheduled_reports", "Scheduled reports"],
    ],
  },
  {
    group: "Collaboration",
    items: [
      ["team_members", "Team members"],
      ["roles_permissions", "Roles & permissions"],
      ["approval_workflows", "Approval workflows"],
      ["internal_notes", "Internal notes & comments"],
      ["client_accounts", "Client accounts"],
      ["activity_log", "Activity & audit log"],
    ],
  },
  {
    group: "Brand",
    items: [
      ["custom_branding", "Custom branding"],
      ["white_label", "White label"],
      ["custom_domain", "Custom domain"],
    ],
  },
  {
    group: "Integrations & data",
    items: [
      ["api_access", "API access"],
      ["webhooks", "Webhooks"],
      ["zapier", "Zapier / Make"],
      ["automations", "Automations"],
      ["export_csv", "CSV export"],
      ["export_pdf", "PDF reports"],
    ],
  },
] as const;

export const ALL_ENTITLEMENTS: string[] = ENTITLEMENT_GROUPS.flatMap((g) => g.items.map(([k]) => k));

const FREE_ENT = [
  "scheduling", "content_calendar", "queue", "drafts", "first_comment",
  "platform_instagram", "platform_facebook", "platform_x", "platform_linkedin", "platform_tiktok", "platform_bluesky",
  "ai_writer", "ai_hashtags", "analytics_basic", "team_members", "export_csv",
];
const PRO_ENT = [
  ...FREE_ENT,
  "bulk_scheduling", "csv_import", "recurring_posts", "evergreen_recycling",
  "platform_youtube", "platform_pinterest", "platform_threads", "platform_gbp",
  "ai_image", "ai_ideas", "ai_repurpose", "ai_best_time", "ai_variations", "ai_content_score",
  "analytics_advanced", "audience_analytics", "automations", "export_pdf", "custom_branding",
];
const TEAM_ENT = [
  ...PRO_ENT,
  "roles_permissions", "approval_workflows", "internal_notes", "activity_log",
  "competitor_analytics", "report_builder", "scheduled_reports",
  "api_access", "webhooks", "zapier", "ai_recommendations",
];
const AGENCY_ENT = [
  ...TEAM_ENT,
  "client_accounts", "white_label", "custom_domain", "ai_video",
];

export const PLAN_CATALOG: Array<{
  key: PlanKey;
  name: string;
  badge?: string;
  currency: string;
  priceMonthly: number;
  priceAnnual: number;
  annualDiscountPct: number;
  trialDays: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  analyticsRetentionDays: number;
  apiRateLimit: number;
  automationLimit: number;
  features: string[];
  entitlements: string[];
  isPublic: boolean;
  isCustom: boolean;
}> = [
  {
    key: "free",
    name: "Free",
    currency: "usd",
    priceMonthly: 0,
    priceAnnual: 0,
    annualDiscountPct: 0,
    trialDays: 0,
    maxChannels: 3,
    maxUsers: 1,
    maxScheduled: 30,
    aiCredits: 20,
    storageMb: 200,
    analyticsRetentionDays: 30,
    apiRateLimit: 0,
    automationLimit: 0,
    features: ["1 workspace", "3 channels", "Composer + calendar", "Basic analytics", "20 AI credits/mo"],
    entitlements: FREE_ENT,
    isPublic: true,
    isCustom: false,
  },
  {
    key: "pro",
    name: "Pro",
    badge: "Most popular",
    currency: "usd",
    priceMonthly: 1800,
    priceAnnual: 18000,
    annualDiscountPct: 17,
    trialDays: 14,
    maxChannels: 10,
    maxUsers: 2,
    maxScheduled: 2000,
    aiCredits: 500,
    storageMb: 5000,
    analyticsRetentionDays: 180,
    apiRateLimit: 0,
    automationLimit: 10,
    features: ["3 workspaces", "10 channels", "AI Content Studio", "Full analytics + insights", "Evergreen recycling", "500 AI credits/mo"],
    entitlements: PRO_ENT,
    isPublic: true,
    isCustom: false,
  },
  {
    key: "team",
    name: "Team",
    currency: "usd",
    priceMonthly: 4900,
    priceAnnual: 49000,
    annualDiscountPct: 17,
    trialDays: 14,
    maxChannels: 25,
    maxUsers: 10,
    maxScheduled: 10000,
    aiCredits: 2500,
    storageMb: 25000,
    analyticsRetentionDays: 365,
    apiRateLimit: 120,
    automationLimit: 50,
    features: ["10 workspaces", "25 channels", "Approval workflows", "Team roles + permissions", "Report builder", "2,500 AI credits/mo"],
    entitlements: TEAM_ENT,
    isPublic: true,
    isCustom: false,
  },
  {
    key: "agency",
    name: "Agency",
    currency: "usd",
    priceMonthly: 12900,
    priceAnnual: 129000,
    annualDiscountPct: 17,
    trialDays: 14,
    maxChannels: 100,
    maxUsers: 30,
    maxScheduled: 100000,
    aiCredits: 10000,
    storageMb: 100000,
    analyticsRetentionDays: 730,
    apiRateLimit: 600,
    automationLimit: 500,
    features: ["Unlimited workspaces", "100 channels", "Agency mode + client portals", "White-label reports", "API + webhooks", "10,000 AI credits/mo"],
    entitlements: AGENCY_ENT,
    isPublic: true,
    isCustom: false,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    currency: "usd",
    priceMonthly: 0,
    priceAnnual: 0,
    annualDiscountPct: 0,
    trialDays: 30,
    maxChannels: 1000,
    maxUsers: 500,
    maxScheduled: 1000000,
    aiCredits: 100000,
    storageMb: 1000000,
    analyticsRetentionDays: 1825,
    apiRateLimit: 6000,
    automationLimit: 100000,
    features: ["Custom channels + seats", "SSO / SCIM", "Audit exports", "Dedicated support", "Custom AI credits"],
    entitlements: ALL_ENTITLEMENTS,
    isPublic: true,
    isCustom: false,
  },
];

export const WEBHOOK_EVENTS = [
  "post.published",
  "post.failed",
  "post.scheduled",
  "approval.requested",
  "approval.approved",
  "conversation.created",
  "insight.created",
] as const;

export const API_SCOPES = [
  "posts:read",
  "posts:write",
  "analytics:read",
  "channels:read",
  "media:write",
  "webhooks:manage",
] as const;
