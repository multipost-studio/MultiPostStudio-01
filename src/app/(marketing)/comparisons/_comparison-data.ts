/**
 * Comparison pages. Every competitor fact below was verified against public
 * vendor pricing and documentation in October 2026.
 * MultiPost Studio facts come from src/lib/constants.ts PLAN_CATALOG.
 * Note: Never add external competitor URLs or backlinks to competitor websites.
 */

export type Comparison = {
  slug: string;
  competitor: string;
  tagline: string;
  /** Direct answer: who each tool fits (2–3 sentences, no superlatives). */
  answer: string;
  positioning: string;
  pricingNote: string;
  rows: { feature: string; multipost: string; competitor: string }[];
  multiPostFit: string[];
  competitorFit: string[];
  faqs: { q: string; a: string }[];
};

export const LAST_VERIFIED = "October 2026";

export const COMPARISONS: Comparison[] = [
  {
    slug: "buffer",
    competitor: "Buffer",
    tagline: "Per-channel simplicity vs flat-rate workspace.",
    answer:
      "Buffer charges per connected channel (from $6/month) and stays deliberately simple; MultiPost Studio charges flat per workspace (from $0 free, $18/month Pro) and bundles approvals, Brand Brain AI and white-label reporting into the workspace. Solo creators with few channels often spend less on Buffer; teams and agencies usually find flat workspace pricing more predictable.",
    positioning:
      "Buffer is the minimalist scheduler: connect channels, queue posts, check analytics. MultiPost Studio is the fuller workspace: the same queue plus multi-stage approvals, client review portals, evergreen recycling and a report builder.",
    pricingNote:
      "Buffer bills per channel — 5 channels on Essentials costs $30/month monthly ($25 annual-equivalent). MultiPost Studio Pro is $18/month flat for up to 10 channels.",
    rows: [
      { feature: "Pricing model", multipost: "Flat per workspace", competitor: "Per channel" },
      { feature: "Free plan", multipost: "Yes — 3 channels, 20 AI credits/mo", competitor: "Yes — 3 channels, 10 scheduled posts each" },
      { feature: "Entry paid price", multipost: "$18/mo (Pro, 10 channels)", competitor: "From $6/mo per channel (Essentials)" },
      { feature: "Approval workflows", multipost: "Multi-stage chains included (Team+)", competitor: "Team plan only" },
      { feature: "AI assistance", multipost: "Brand Brain drafts + scoring", competitor: "AI Assistant on all plans" },
      { feature: "First-comment scheduling", multipost: "Included", competitor: "Essentials and up" },
      { feature: "Evergreen recycling", multipost: "Built in (Pro+)", competitor: "Queue-based re-buffering" },
      { feature: "White-label client reports", multipost: "Report builder + scheduled delivery", competitor: "Available on higher tiers" },
    ],
    multiPostFit: [
      "Agencies that want client workspaces and locked approval trails for one flat fee",
      "Teams that need multi-stage review (creator → editor → manager → client)",
      "Anyone who wants AI drafts tuned to a saved brand voice",
    ],
    competitorFit: [
      "Solo creators with 1–3 channels who want the simplest possible queue",
      "Users who prefer paying only for exactly the channels they connect",
    ],
    faqs: [
      { q: "Is MultiPost Studio cheaper than Buffer?", a: "It depends on channel count. At 1–2 channels Buffer Essentials ($6–$12/month) can cost less than MultiPost Studio Pro ($18/month). At 5+ channels, flat workspace pricing usually wins — 10 channels cost $18/month on Pro versus $60/month on Buffer Essentials monthly." },
      { q: "Does Buffer have approval workflows?", a: "Yes, but only on the Team plan (from $12/channel/month). MultiPost Studio includes multi-stage approval chains on Team plans too, with frozen approved versions." },
      { q: "Can I migrate scheduled content from Buffer?", a: "Export your calendar as CSV and import it — bulk CSV import is built for exactly this move." },
    ],
  },
  {
    slug: "hootsuite",
    competitor: "Hootsuite",
    tagline: "Enterprise breadth vs focused workspace value.",
    answer:
      "Hootsuite is the enterprise incumbent: per-seat pricing from $99/user/month with deep listening, ads and 600+ app integrations. MultiPost Studio is the focused alternative: flat workspace pricing from $0–$129/month covering scheduling, approvals, AI and reporting for teams that don't need an enterprise suite.",
    positioning:
      "Hootsuite sells breadth — social listening, employee advocacy, a huge app directory — priced per seat. MultiPost Studio sells depth in the core workflow: plan, create, approve, publish, engage and measure, priced per workspace so adding teammates doesn't multiply the bill.",
    pricingNote:
      "Hootsuite Standard is $99 per user per month (annual) for up to 10 social accounts. A 3-person team starts near $300/month. MultiPost Studio Team is $49/month flat for up to 10 users and 25 channels.",
    rows: [
      { feature: "Pricing model", multipost: "Flat per workspace", competitor: "Per user (seat)" },
      { feature: "Free plan", multipost: "Yes — free forever", competitor: "14-day trial, no free plan" },
      { feature: "Entry paid price", multipost: "$18/mo (Pro)", competitor: "$99/user/mo (Standard, annual)" },
      { feature: "Social accounts at entry", multipost: "10 channels (Pro)", competitor: "10 social accounts (Standard)" },
      { feature: "Approval workflows", multipost: "Multi-stage chains (Team+)", competitor: "Advanced plan" },
      { feature: "AI content tools", multipost: "Brand Brain + scoring", competitor: "OwlyWriter AI across plans" },
      { feature: "Unified inbox", multipost: "Included with AI replies", competitor: "Included, automation on higher tiers" },
      { feature: "Social listening", multipost: "Competitor benchmarking", competitor: "Deep listening + sentiment (strength)" },
    ],
    multiPostFit: [
      "Small teams and agencies priced out of per-seat enterprise billing",
      "Workflows centered on approvals, client review and white-label reporting",
      "Teams that want one workspace charge instead of per-head multiplication",
    ],
    competitorFit: [
      "Enterprises needing SSO at scale, compliance integrations and deep listening",
      "Organizations running paid social + organic from one suite",
    ],
    faqs: [
      { q: "Why is Hootsuite so much more expensive?", a: "Per-seat pricing plus enterprise features (listening, advocacy, compliance). If you use those, the price reflects it. If you only need scheduling through reporting, a flat workspace plan costs a fraction." },
      { q: "Does Hootsuite have a free plan?", a: "No — a 14-day trial. MultiPost Studio's free plan (3 channels, basic analytics, 20 AI credits/month) stays free." },
      { q: "What would we lose switching from Hootsuite?", a: "Deep social listening, the large app directory and enterprise compliance tooling. If those are load-bearing, stay. If your week is drafting, approving, queuing and reporting, the core workflow transfers directly." },
    ],
  },
];

export const COMPARISON_SLUGS = COMPARISONS.map((c) => c.slug);

export function getComparison(slug: string): Comparison | undefined {
  return COMPARISONS.find((c) => c.slug === slug);
}
