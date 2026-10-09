/**
 * The notification type registry: the single list of everything the product can notify about.
 * Pure data and helpers (no database, no server-only imports), so the bell, the /notifications page,
 * the settings screen and the server all read the same definitions.
 *
 * Only events this product can really detect are listed. Ids already stored on older rows keep their
 * original lowercase spelling (publish_success, approval_request, ...), so history keeps its meaning.
 */

export const CATEGORIES = ["publishing", "scheduling", "engagement", "mentions", "team", "account", "billing", "system"] as const;
export type NotificationCategory = (typeof CATEGORIES)[number];

export const PRIORITIES = ["low", "normal", "high", "critical"] as const;
export type NotificationPriority = (typeof PRIORITIES)[number];

export const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  publishing: "Publishing",
  scheduling: "Scheduling",
  engagement: "Engagement",
  mentions: "Mentions",
  team: "Team",
  account: "Account",
  billing: "Billing",
  system: "System",
};

export type TypeDef = {
  id: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  label: string;
  /** One line for the settings screen. */
  description: string;
  /**
   * Cannot be switched off in settings: a missed payment or a security change that the user never sees
   * is worse than one more line in the bell.
   */
  required?: boolean;
  /** Which existing email switch governs mirroring this type to email. Absent = in-app only. */
  email?: "emailPublish" | "emailApproval" | "emailMentions" | "always";
  /** Where the id sits in the UI "Mentions" tab. */
  mention?: boolean;
};

const defs: TypeDef[] = [
  // Publishing
  { id: "publish_success", category: "publishing", priority: "normal", label: "Post published", description: "A post went live on every channel", email: "emailPublish" },
  { id: "publish_failed", category: "publishing", priority: "high", label: "Publishing failed", description: "A post could not be published", email: "emailPublish" },
  { id: "publish_partial", category: "publishing", priority: "high", label: "Partly published", description: "Some channels published and others failed", email: "emailPublish" },
  // Scheduling
  { id: "post_reminder", category: "scheduling", priority: "normal", label: "Upcoming post", description: "A scheduled post is about to go out" },
  { id: "post_missed", category: "scheduling", priority: "high", label: "Missed schedule", description: "A scheduled post did not go out on time", email: "emailPublish" },
  { id: "draft_reminder", category: "scheduling", priority: "low", label: "Draft waiting", description: "A draft has been sitting unfinished" },
  { id: "calendar_gap", category: "scheduling", priority: "low", label: "Empty calendar", description: "Nothing is scheduled for the coming days" },
  { id: "posting_reminder", category: "scheduling", priority: "low", label: "Time to post", description: "You have not posted in a while (opt-in)" },
  // Engagement
  { id: "streak_milestone", category: "engagement", priority: "normal", label: "Streak milestone", description: "Your posting streak hit a milestone" },
  { id: "inbox_followup", category: "engagement", priority: "normal", label: "Conversation waiting", description: "An inbox conversation assigned to you is waiting for a reply" },
  { id: "engagement_milestone", category: "engagement", priority: "normal", label: "Engagement milestone", description: "A post passed an engagement threshold" },
  // Mentions
  { id: "mention", category: "mentions", priority: "normal", label: "Mention", description: "Someone @mentioned you", email: "emailMentions", mention: true },
  { id: "comment", category: "mentions", priority: "normal", label: "Comment", description: "A new comment on your content", mention: true },
  // Team
  { id: "approval_request", category: "team", priority: "normal", label: "Approval", description: "Something needs review, or a review finished", email: "emailApproval" },
  { id: "approval_overdue", category: "team", priority: "high", label: "Approval overdue", description: "A review has been waiting too long", email: "emailApproval" },
  { id: "team_added", category: "team", priority: "normal", label: "Added to a team", description: "You were added to a workspace" },
  { id: "client_feedback", category: "team", priority: "normal", label: "Client feedback", description: "A client replied through a review link", email: "emailApproval" },
  // Account
  { id: "account_expired", category: "account", priority: "critical", label: "Account needs reconnecting", description: "A connected social account stopped working", required: true, email: "always" },
  { id: "account_expiring", category: "account", priority: "high", label: "Account connection expiring", description: "A social connection will expire soon" },
  { id: "security_password_changed", category: "account", priority: "critical", label: "Password changed", description: "Your password was changed", required: true, email: "always" },
  { id: "security_two_factor", category: "account", priority: "critical", label: "Two-factor changed", description: "Two-factor sign-in was turned on or off", required: true, email: "always" },
  // Billing
  { id: "billing_payment_failed", category: "billing", priority: "critical", label: "Payment failed", description: "A subscription payment did not go through", required: true, email: "always" },
  { id: "billing_plan_changed", category: "billing", priority: "normal", label: "Plan updated", description: "Your plan or billing cycle changed" },
  { id: "billing_canceled", category: "billing", priority: "high", label: "Subscription canceled", description: "A subscription was canceled or ended", required: true },
  // System
  { id: "system", category: "system", priority: "normal", label: "Announcement", description: "Product news and notices from MultiPost Studio" },
  { id: "support_update", category: "system", priority: "normal", label: "Support reply", description: "Our team replied to your request" },
];

export const NOTIFICATION_TYPES: readonly TypeDef[] = defs;

const byId = new Map(defs.map((d) => [d.id, d]));

export function getTypeDef(id: string): TypeDef | undefined {
  return byId.get(id);
}

/** Older code (and admin broadcasts) pass free-form type strings; anything unknown files under System. */
export function categoryOf(type: string): NotificationCategory {
  const def = byId.get(type);
  if (def) return def.category;
  if (type.startsWith("approval")) return "team";
  if (type.startsWith("publish")) return "publishing";
  return "system";
}

export function defaultPriorityOf(type: string): NotificationPriority {
  return byId.get(type)?.priority ?? "normal";
}

export function isRequiredType(type: string): boolean {
  return byId.get(type)?.required === true;
}

export function isCategory(v: unknown): v is NotificationCategory {
  return typeof v === "string" && (CATEGORIES as readonly string[]).includes(v);
}

export function isPriority(v: unknown): v is NotificationPriority {
  return typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);
}

/** Rank for sorting/deciding what interrupts: critical outranks everything. */
export const PRIORITY_RANK: Record<NotificationPriority, number> = { low: 0, normal: 1, high: 2, critical: 3 };

/** Types the UI should treat as a "Mentions" tab entry. */
export function isMentionType(type: string): boolean {
  return byId.get(type)?.mention === true;
}

/** Plain-language names for platforms, for notification copy. */
const PLATFORM_NAME: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
  gbp: "Google Business Profile",
  bluesky: "Bluesky",
};

export function platformName(p: string): string {
  return PLATFORM_NAME[p] ?? p.charAt(0).toUpperCase() + p.slice(1);
}

/** "Instagram", "Instagram and X", "Instagram, X and LinkedIn". */
export function joinPlatforms(platforms: string[]): string {
  const names = [...new Set(platforms)].map(platformName);
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
