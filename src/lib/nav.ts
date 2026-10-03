import type { Permission } from "@/lib/rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // lucide icon name
  /** One-line "what is this / how does it help" shown via an info tooltip. */
  description?: string;
  permission?: Permission;
  /** Plan capability key (see ENTITLEMENT_GROUPS). Shown locked when the org's
   *  plan lacks it — hiding it made paid features look like missing ones. */
  entitlement?: string;
  /** Set per-request by the app layout: the org's plan doesn't include this. */
  locked?: boolean;
  /** Cheapest plan that unlocks it — shown as the nav badge, e.g. "Pro". */
  lockedPlan?: { key: string; name: string };
  badgeKey?: "approvals" | "inbox" | "notifications";
};

export type NavGroup = { title: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "",
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: "LayoutDashboard",
        description: "Your daily snapshot — what's scheduled, what needs review, and how your content is performing.",
      },
    ],
  },
  {
    title: "Create",
    items: [
      {
        label: "Ideas",
        href: "/ideas",
        icon: "Lightbulb",
        permission: "content.create",
        description: "Capture and organize content ideas before they're ready to become a post.",
      },
      {
        label: "Content Studio",
        href: "/studio",
        icon: "Sparkles",
        permission: "content.create",
        description: "AI-assisted drafting — hooks, captions and platform variants tuned to your brand voice.",
      },
      {
        label: "Templates",
        href: "/templates",
        icon: "LayoutTemplate",
        permission: "content.create",
        description: "Reusable post layouts you can adapt instead of starting from a blank composer.",
      },
    ],
  },
  {
    title: "Publish",
    items: [
      {
        label: "Composer",
        href: "/composer",
        icon: "PenLine",
        permission: "content.create",
        description: "Write, preview and publish a post to any connected platform.",
      },
      {
        label: "Calendar",
        href: "/calendar",
        icon: "Calendar",
        description: "Drag-and-drop view of everything scheduled across every channel.",
      },
      {
        label: "Queue",
        href: "/queue",
        icon: "ListOrdered",
        description: "The publish pipeline — what's about to go out, per channel, and in what order.",
      },
    ],
  },
  {
    title: "Engage",
    items: [
      {
        label: "Inbox",
        href: "/inbox",
        icon: "Inbox",
        permission: "inbox.respond",
        badgeKey: "inbox",
        description: "Comments, DMs, mentions and reviews from every platform in one place, with one-click AI replies.",
      },
      {
        label: "Comments",
        href: "/comments",
        icon: "MessageSquare",
        permission: "inbox.respond",
        description: "Moderate and respond to comments across all your connected channels.",
      },
    ],
  },
  {
    title: "Analyze",
    items: [
      {
        label: "Overview",
        href: "/analytics",
        icon: "BarChart3",
        permission: "analytics.view",
        description: "Cross-channel performance at a glance — followers, reach, engagement and publish health.",
      },
      {
        label: "Content",
        href: "/analytics/content",
        icon: "FileBarChart",
        permission: "analytics.view",
        description: "See which individual posts are working, and why.",
      },
      {
        label: "Audience",
        href: "/analytics/audience",
        icon: "Users2",
        permission: "analytics.view",
        entitlement: "audience_analytics",
        description: "Who's actually following and engaging with you — demographics and growth trends.",
      },
      {
        label: "YouTube Analytics",
        href: "/analytics/youtube",
        icon: "PlayCircle",
        permission: "analytics.view",
        description: "Private, channel-owner-only YouTube data — views, watch time and traffic sources.",
      },
      {
        label: "Google Business",
        href: "/analytics/gbp",
        icon: "Building2",
        permission: "analytics.view",
        description: "Search & Maps impressions, website clicks, calls, direction requests, and top keywords.",
      },
      {
        label: "Campaigns",
        href: "/campaigns",
        icon: "Megaphone",
        permission: "analytics.view",
        description: "Group posts under a goal, track budget, and measure what a campaign actually drove.",
      },
      {
        label: "Reports",
        href: "/reports",
        icon: "FileText",
        permission: "reports.manage",
        entitlement: "report_builder",
        description: "Build a shareable, white-labeled performance report for clients or stakeholders.",
      },
    ],
  },
  {
    title: "Intelligence",
    items: [
      {
        label: "AI Insights",
        href: "/insights",
        icon: "Brain",
        permission: "analytics.view",
        entitlement: "ai_recommendations",
        description: "Recommendations on what to post next, based on what's already worked for you.",
      },
      {
        label: "Trends",
        href: "/trends",
        icon: "TrendingUp",
        permission: "analytics.view",
        description: "What's gaining traction right now, pulled from real platform signals.",
      },
      {
        label: "Competitors",
        href: "/competitors",
        icon: "Crosshair",
        permission: "analytics.view",
        entitlement: "competitor_analytics",
        description: "Track how competitor accounts are performing against yours.",
      },
      {
        label: "Opportunities",
        href: "/opportunities",
        icon: "Target",
        permission: "analytics.view",
        description: "Gaps and openings in your content strategy worth acting on.",
      },
    ],
  },
  {
    title: "Manage",
    items: [
      {
        label: "Media Library",
        href: "/media",
        icon: "Image",
        permission: "media.manage",
        description: "All your uploaded images, videos and assets, ready to drop into any post.",
      },
      {
        label: "Automations",
        href: "/automations",
        icon: "Workflow",
        permission: "automations.manage",
        entitlement: "automations",
        description: "Rules that act on your behalf — auto-reply, auto-tag, scheduled recycling and more.",
      },
      {
        label: "Recycling",
        href: "/recycling",
        icon: "Recycle",
        permission: "content.edit",
        entitlement: "evergreen_recycling",
        description: "Automatically re-queue your best-performing evergreen posts on a schedule.",
      },
      {
        label: "Team",
        href: "/team",
        icon: "UsersRound",
        permission: "analytics.view",
        description: "Manage who's on your workspace and what they're allowed to do.",
      },
      {
        label: "Approvals",
        href: "/approvals",
        icon: "CheckCheck",
        badgeKey: "approvals",
        entitlement: "approval_workflows",
        description: "Posts waiting on a review before they can go live.",
      },
      {
        label: "Integrations",
        href: "/integrations",
        icon: "Plug",
        permission: "integrations.manage",
        description: "Connect the social platforms you want to publish to.",
      },
      {
        label: "Affiliate program",
        href: "/affiliate",
        icon: "Handshake",
        description: "Earn real commissions by referring other businesses to MultiPost Studio.",
      },
    ],
  },
];

export const AGENCY_NAV: NavItem = {
  label: "Agency",
  href: "/agency",
  icon: "Building2",
  permission: "agency.manage",
  description: "Manage every client workspace from one place.",
};

export const SETTINGS_NAV: { label: string; href: string; icon: string }[] = [
  { label: "Profile", href: "/settings/profile", icon: "User" },
  { label: "Security", href: "/settings/security", icon: "ShieldCheck" },
  { label: "Devices", href: "/settings/devices", icon: "MonitorSmartphone" },
  { label: "Workspace", href: "/settings/workspace", icon: "Building" },
  { label: "Brand Brain", href: "/settings/brand", icon: "Brain" },
  { label: "Notifications", href: "/settings/notifications", icon: "Bell" },
  { label: "Privacy & Data", href: "/settings/privacy", icon: "ShieldCheck" },
  { label: "Billing", href: "/settings/billing", icon: "CreditCard" },
  { label: "AI Providers", href: "/settings/ai", icon: "Sparkles" },
  { label: "API Keys", href: "/settings/api", icon: "Code2" },
  { label: "Webhook Center", href: "/settings/webhooks", icon: "Webhook" },
  { label: "Support", href: "/settings/support", icon: "LifeBuoy" },
];

export const ADMIN_NAV: { label: string; href: string; icon: string; group?: string }[] = [
  { label: "Overview", href: "/admin", icon: "Gauge" },

  { label: "Users", href: "/admin/users", icon: "Users", group: "People & organizations" },
  { label: "Organizations", href: "/admin/orgs", icon: "Building2", group: "People & organizations" },
  { label: "Affiliates", href: "/admin/affiliates", icon: "Handshake", group: "People & organizations" },

  { label: "Plans", href: "/admin/plans", icon: "CreditCard", group: "Revenue" },
  { label: "Billing", href: "/admin/billing", icon: "Receipt", group: "Revenue" },

  { label: "Blog", href: "/admin/blog", icon: "Newspaper", group: "Content" },
  { label: "Categories", href: "/admin/blog/categories", icon: "FolderTree", group: "Content" },
  { label: "Tags", href: "/admin/blog/tags", icon: "Tag", group: "Content" },
  { label: "Authors", href: "/admin/blog/authors", icon: "UserCheck", group: "Content" },
  { label: "Media", href: "/admin/blog/media", icon: "Image", group: "Content" },
  { label: "Comments", href: "/admin/blog/comments", icon: "MessageSquare", group: "Content" },
  { label: "Blog Settings", href: "/admin/blog/settings", icon: "Sliders", group: "Content" },

  { label: "Posts", href: "/admin/posts", icon: "PenLine", group: "Social & AI" },
  { label: "Content (CMS)", href: "/admin/content", icon: "FileText", group: "Social & AI" },
  { label: "AI Providers", href: "/admin/ai", icon: "Sparkles", group: "Social & AI" },
  { label: "Broadcast", href: "/admin/broadcast", icon: "Megaphone", group: "Social & AI" },

  { label: "Feature Flags", href: "/admin/flags", icon: "ToggleRight", group: "Platform" },
  { label: "Usage & API", href: "/admin/usage", icon: "Activity", group: "Platform" },
  { label: "Connections", href: "/admin/connections", icon: "Plug", group: "Platform" },
  { label: "Notifications", href: "/admin/notifications", icon: "Bell", group: "Platform" },
  { label: "Site Settings", href: "/admin/settings", icon: "Settings", group: "Platform" },
  { label: "Design System", href: "/admin/design-system", icon: "Palette", group: "Platform" },

  { label: "Support", href: "/admin/support", icon: "LifeBuoy", group: "Operations" },
  { label: "Privacy Requests", href: "/admin/privacy-requests", icon: "ShieldCheck", group: "Operations" },
  { label: "Audit Log", href: "/admin/audit", icon: "ScrollText", group: "Operations" },
  { label: "Security & Lockouts", href: "/admin/security", icon: "ShieldAlert", group: "Operations" },
  { label: "Queue Engine", href: "/admin/queue", icon: "Cpu", group: "Operations" },
  { label: "System Health", href: "/admin/system", icon: "HeartPulse", group: "Operations" },
  { label: "Health Probes", href: "/admin/health", icon: "Activity", group: "Operations" },
  { label: "Observability", href: "/admin/observability", icon: "Radio", group: "Operations" },
];
