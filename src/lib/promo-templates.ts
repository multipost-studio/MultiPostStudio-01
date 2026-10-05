import { ALL_ENTITLEMENTS, PLAN_CATALOG } from "@/lib/constants";
import type { PromoCardInput, PromoPlacement, PromoTone } from "@/lib/promo-cards";

/**
 * Ready-made promo cards for the admin "New card" picker and the starter set.
 * Every template points at a real, user-facing page and says only things that
 * are true of the product as shipped. Templates that only make sense for some
 * plans declare it through entitlements (resolved against PLAN_CATALOG), so
 * "Unlock automations" is never shown to a plan that already has them.
 *
 * Templates never publish: they fill the form, and the admin reviews and turns
 * the card on. promo-templates.test.ts checks every link against the real nav.
 */

export type PromoTemplateCategory = "Upgrade" | "Create" | "Grow" | "Analyze" | "Team" | "Earn";

export type PromoTemplate = {
  id: string;
  category: PromoTemplateCategory;
  title: string;
  description: string;
  ctaText: string;
  ctaUrl: string;
  icon: string;
  tone: PromoTone;
  placement?: PromoPlacement;
  priority?: number;
  /** Show only to plans that include this entitlement. */
  forPlansWith?: string;
  /** Show only to plans that do NOT include this entitlement (upgrade prompts). */
  forPlansWithout?: string;
  /** Only offered while this site setting is on (the feature behind the link must be live). */
  requiresSetting?: "affiliateEnabled";
  /** Part of the one-click starter set on an empty list. */
  starter?: boolean;
};

export const PROMO_TEMPLATES: PromoTemplate[] = [
  // --- Upgrade ---------------------------------------------------------
  {
    id: "upgrade-pro",
    category: "Upgrade",
    title: "Upgrade to Pro",
    description: "More channels, more AI credits and advanced analytics for growing accounts.",
    ctaText: "See plans",
    ctaUrl: "/settings/billing",
    icon: "Crown",
    tone: "brand",
    priority: 30,
    forPlansWithout: "analytics_advanced",
    starter: true,
  },
  {
    id: "unlock-automations",
    category: "Upgrade",
    title: "Unlock automations",
    description: "Run rules when a post publishes or takes off: notifications, tagging and AI suggestions.",
    ctaText: "See plans",
    ctaUrl: "/settings/billing",
    icon: "Zap",
    tone: "accent",
    forPlansWithout: "automations",
  },
  {
    id: "unlock-more-platforms",
    category: "Upgrade",
    title: "Publish to more platforms",
    description: "Add YouTube, Pinterest, Threads and Google Business to your connected channels.",
    ctaText: "See plans",
    ctaUrl: "/settings/billing",
    icon: "Share2",
    tone: "neutral",
    forPlansWithout: "platform_youtube",
  },
  {
    id: "unlock-approvals",
    category: "Upgrade",
    title: "Add an approval step",
    description: "Route posts through multi-stage review with approval workflows.",
    ctaText: "See plans",
    ctaUrl: "/settings/billing",
    icon: "Users",
    tone: "neutral",
    forPlansWithout: "approval_workflows",
  },

  // --- Create ----------------------------------------------------------
  {
    id: "ai-studio",
    category: "Create",
    title: "Write with AI",
    description: "Generate on-brand captions and hashtags in seconds with Content Studio.",
    ctaText: "Open Studio",
    ctaUrl: "/studio",
    icon: "Sparkles",
    tone: "brand",
    priority: 20,
    forPlansWith: "ai_writer",
    starter: true,
  },
  {
    id: "repurpose",
    category: "Create",
    title: "Repurpose long-form content",
    description: "Turn long-form content into social posts with AI repurposing.",
    ctaText: "Try repurposing",
    ctaUrl: "/studio",
    icon: "Rocket",
    tone: "neutral",
    forPlansWith: "ai_repurpose",
  },
  {
    id: "templates",
    category: "Create",
    title: "Start from a template",
    description: "Start a draft from reusable post structures in one click.",
    ctaText: "Browse templates",
    ctaUrl: "/templates",
    icon: "Star",
    tone: "neutral",
  },
  {
    id: "brand-brain",
    category: "Create",
    title: "Teach the AI your voice",
    description: "Give the AI your guidelines and best posts so captions sound like you.",
    ctaText: "Set up Brand Brain",
    ctaUrl: "/settings/brand",
    icon: "Flame",
    tone: "accent",
    forPlansWith: "ai_writer",
  },

  // --- Grow ------------------------------------------------------------
  {
    id: "connect-platform",
    category: "Grow",
    title: "Connect another platform",
    description: "Publish everywhere from one place. Add your next channel in a minute.",
    ctaText: "Connect",
    ctaUrl: "/integrations",
    icon: "Plug",
    tone: "neutral",
    priority: 10,
    starter: true,
  },
  {
    id: "plan-the-week",
    category: "Grow",
    title: "Plan your week",
    description: "Schedule posts on the content calendar so you never miss a day.",
    ctaText: "Open calendar",
    ctaUrl: "/calendar",
    icon: "TrendingUp",
    tone: "neutral",
    forPlansWith: "content_calendar",
  },
  {
    id: "best-time",
    category: "Grow",
    title: "Post at the best time",
    description: "Get AI best-time suggestions in the composer and calendar.",
    ctaText: "Open calendar",
    ctaUrl: "/calendar",
    icon: "Bell",
    tone: "brand",
    forPlansWith: "ai_best_time",
  },
  {
    id: "campaigns",
    category: "Grow",
    title: "Run a campaign",
    description: "Group posts under one goal and track budget, reach and ROI together.",
    ctaText: "New campaign",
    ctaUrl: "/campaigns?new=1",
    icon: "Megaphone",
    tone: "accent",
  },
  {
    id: "recycle-evergreen",
    category: "Grow",
    title: "Recycle your best posts",
    description: "Repost evergreen content automatically with frequency caps, so nothing feels repetitive.",
    ctaText: "Set up recycling",
    ctaUrl: "/recycling",
    icon: "PartyPopper",
    tone: "neutral",
    forPlansWith: "evergreen_recycling",
  },
  {
    id: "automations",
    category: "Grow",
    title: "Put busywork on autopilot",
    description: "Set rules that notify you, tag top performers and suggest repurposing when a post takes off.",
    ctaText: "Open automations",
    ctaUrl: "/automations",
    icon: "Zap",
    tone: "brand",
    forPlansWith: "automations",
  },

  // --- Analyze ---------------------------------------------------------
  {
    id: "audience-insights",
    category: "Analyze",
    title: "Know your audience",
    description: "Follower growth and distribution across your channels.",
    ctaText: "View audience",
    ctaUrl: "/analytics/audience",
    icon: "BarChart3",
    tone: "neutral",
    forPlansWith: "audience_analytics",
  },
  {
    id: "youtube-analytics",
    category: "Analyze",
    title: "Track your YouTube channel",
    description: "Views, watch time and subscribers alongside your other channels.",
    ctaText: "Open analytics",
    ctaUrl: "/analytics/youtube",
    icon: "BarChart3",
    tone: "neutral",
    forPlansWith: "platform_youtube",
  },
  {
    id: "gbp-analytics",
    category: "Analyze",
    title: "Track your Google Business profile",
    description: "Search and Maps impressions, website clicks, calls and direction requests.",
    ctaText: "Open analytics",
    ctaUrl: "/analytics/gbp",
    icon: "BarChart3",
    tone: "neutral",
    forPlansWith: "platform_gbp",
  },
  {
    id: "reports",
    category: "Analyze",
    title: "Build client-ready reports",
    description: "Build a report from your analytics, then export it, share a link or schedule delivery.",
    ctaText: "Build a report",
    ctaUrl: "/reports?new=1",
    icon: "Gift",
    tone: "brand",
    forPlansWith: "report_builder",
  },
  {
    id: "competitors",
    category: "Analyze",
    title: "Benchmark your competitors",
    description: "Add competitors and compare follower counts, posting frequency and engagement with yours.",
    ctaText: "Add competitors",
    ctaUrl: "/competitors",
    icon: "Handshake",
    tone: "neutral",
    forPlansWith: "competitor_analytics",
  },

  // --- Team ------------------------------------------------------------
  {
    id: "invite-team",
    category: "Team",
    title: "Invite your team",
    description: "Add teammates with roles and permissions across your workspaces.",
    ctaText: "Invite teammates",
    ctaUrl: "/team",
    icon: "Users",
    tone: "neutral",
    forPlansWith: "roles_permissions",
  },
  {
    id: "approvals",
    category: "Team",
    title: "Review before publishing",
    description: "Add multi-stage review so nothing goes live without a sign-off.",
    ctaText: "Set up approvals",
    ctaUrl: "/approvals",
    icon: "Star",
    tone: "accent",
    forPlansWith: "approval_workflows",
  },

  // --- Earn ------------------------------------------------------------
  {
    id: "affiliate",
    category: "Earn",
    title: "Earn with our affiliate program",
    description: "Earn commission when a business you refer becomes a paying customer.",
    ctaText: "Join the program",
    ctaUrl: "/affiliate",
    icon: "Gift",
    tone: "accent",
    requiresSetting: "affiliateEnabled",
  },
];

/** Plan keys (from the default catalog) matching a template's entitlement rule. */
export function templateTargetPlans(t: PromoTemplate): string[] {
  const keys = t.forPlansWith
    ? PLAN_CATALOG.filter((p) => p.entitlements.includes(t.forPlansWith!)).map((p) => p.key)
    : t.forPlansWithout
      ? PLAN_CATALOG.filter((p) => !p.entitlements.includes(t.forPlansWithout!)).map((p) => p.key)
      : [];
  // A rule every plan satisfies is no restriction — and an explicit list would
  // wrongly exclude custom plans. Empty means "everyone".
  return keys.length === PLAN_CATALOG.length ? [] : keys;
}

/** Human note for the picker, e.g. "Shown to: Free". */
export function templateAudienceNote(t: PromoTemplate): string {
  const keys = templateTargetPlans(t);
  if (keys.length === 0) return "Shown to every plan";
  const names = keys.map((k) => PLAN_CATALOG.find((p) => p.key === k)?.name ?? k);
  return `Shown to: ${names.join(", ")}`;
}

/** The form/action payload for a template. Always a draft. */
export function templateToInput(t: PromoTemplate): PromoCardInput {
  return {
    title: t.title,
    description: t.description,
    ctaText: t.ctaText,
    ctaUrl: t.ctaUrl,
    icon: t.icon,
    tone: t.tone,
    placement: t.placement ?? "sidebar",
    priority: t.priority ?? 0,
    enabled: false,
    dismissible: true,
    targetPlans: templateTargetPlans(t),
  };
}

export const STARTER_TEMPLATES = PROMO_TEMPLATES.filter((t) => t.starter);

export const KNOWN_ENTITLEMENTS = new Set(ALL_ENTITLEMENTS);
