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

export const PLAN_CATALOG: Array<{
  key: PlanKey;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  features: string[];
}> = [
  {
    key: "free",
    name: "Free",
    priceMonthly: 0,
    priceAnnual: 0,
    maxChannels: 3,
    maxUsers: 1,
    maxScheduled: 30,
    aiCredits: 20,
    storageMb: 200,
    features: ["1 workspace", "3 channels", "Composer + calendar", "Basic analytics", "20 AI credits/mo"],
  },
  {
    key: "pro",
    name: "Pro",
    priceMonthly: 1800,
    priceAnnual: 18000,
    maxChannels: 10,
    maxUsers: 2,
    maxScheduled: 2000,
    aiCredits: 500,
    storageMb: 5000,
    features: ["3 workspaces", "10 channels", "AI Content Studio", "Full analytics + insights", "Evergreen recycling", "500 AI credits/mo"],
  },
  {
    key: "team",
    name: "Team",
    priceMonthly: 4900,
    priceAnnual: 49000,
    maxChannels: 25,
    maxUsers: 10,
    maxScheduled: 10000,
    aiCredits: 2500,
    storageMb: 25000,
    features: ["10 workspaces", "25 channels", "Approval workflows", "Team roles + permissions", "Report builder", "2,500 AI credits/mo"],
  },
  {
    key: "agency",
    name: "Agency",
    priceMonthly: 12900,
    priceAnnual: 129000,
    maxChannels: 100,
    maxUsers: 30,
    maxScheduled: 100000,
    aiCredits: 10000,
    storageMb: 100000,
    features: ["Unlimited workspaces", "100 channels", "Agency mode + client portals", "White-label reports", "API + webhooks", "10,000 AI credits/mo"],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    priceMonthly: 0,
    priceAnnual: 0,
    maxChannels: 1000,
    maxUsers: 500,
    maxScheduled: 1000000,
    aiCredits: 100000,
    storageMb: 1000000,
    features: ["Custom channels + seats", "SSO / SCIM", "Audit exports", "Dedicated support", "Custom AI credits"],
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
