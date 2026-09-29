import type { Permission } from "@/lib/rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // lucide icon name
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
    items: [{ label: "Dashboard", href: "/dashboard", icon: "LayoutDashboard" }],
  },
  {
    title: "Create",
    items: [
      { label: "Ideas", href: "/ideas", icon: "Lightbulb", permission: "content.create" },
      { label: "Content Studio", href: "/studio", icon: "Sparkles", permission: "content.create" },
      { label: "Templates", href: "/templates", icon: "LayoutTemplate", permission: "content.create" },
    ],
  },
  {
    title: "Publish",
    items: [
      { label: "Composer", href: "/composer", icon: "PenLine", permission: "content.create" },
      { label: "Calendar", href: "/calendar", icon: "Calendar" },
      { label: "Queue", href: "/queue", icon: "ListOrdered" },
    ],
  },
  {
    title: "Engage",
    items: [
      { label: "Inbox", href: "/inbox", icon: "Inbox", permission: "inbox.respond", badgeKey: "inbox" },
      { label: "Comments", href: "/comments", icon: "MessageSquare", permission: "inbox.respond" },
    ],
  },
  {
    title: "Analyze",
    items: [
      { label: "Overview", href: "/analytics", icon: "BarChart3", permission: "analytics.view" },
      { label: "Content", href: "/analytics/content", icon: "FileBarChart", permission: "analytics.view" },
      { label: "Audience", href: "/analytics/audience", icon: "Users2", permission: "analytics.view", entitlement: "audience_analytics" },
      { label: "Campaigns", href: "/campaigns", icon: "Megaphone", permission: "analytics.view" },
      { label: "Reports", href: "/reports", icon: "FileText", permission: "reports.manage", entitlement: "report_builder" },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "AI Insights", href: "/insights", icon: "Brain", permission: "analytics.view", entitlement: "ai_recommendations" },
      { label: "Trends", href: "/trends", icon: "TrendingUp", permission: "analytics.view" },
      { label: "Competitors", href: "/competitors", icon: "Crosshair", permission: "analytics.view", entitlement: "competitor_analytics" },
      { label: "Opportunities", href: "/opportunities", icon: "Target", permission: "analytics.view" },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Media Library", href: "/media", icon: "Image", permission: "media.manage" },
      { label: "Automations", href: "/automations", icon: "Workflow", permission: "automations.manage", entitlement: "automations" },
      { label: "Recycling", href: "/recycling", icon: "Recycle", permission: "content.edit", entitlement: "evergreen_recycling" },
      { label: "Team", href: "/team", icon: "UsersRound", permission: "analytics.view" },
      { label: "Approvals", href: "/approvals", icon: "CheckCheck", badgeKey: "approvals", entitlement: "approval_workflows" },
      { label: "Integrations", href: "/integrations", icon: "Plug", permission: "integrations.manage" },
      { label: "Refer & earn", href: "/referrals", icon: "Gift" },
    ],
  },
];

export const AGENCY_NAV: NavItem = { label: "Agency", href: "/agency", icon: "Building2", permission: "agency.manage" };

export const SETTINGS_NAV: { label: string; href: string; icon: string }[] = [
  { label: "Profile", href: "/settings/profile", icon: "User" },
  { label: "Security", href: "/settings/security", icon: "ShieldCheck" },
  { label: "Devices", href: "/settings/devices", icon: "MonitorSmartphone" },
  { label: "Workspace", href: "/settings/workspace", icon: "Building" },
  { label: "Brand Brain", href: "/settings/brand", icon: "Brain" },
  { label: "Notifications", href: "/settings/notifications", icon: "Bell" },
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
  { label: "Referrals", href: "/admin/referrals", icon: "Gift", group: "People & organizations" },

  { label: "Plans", href: "/admin/plans", icon: "CreditCard", group: "Revenue" },
  { label: "Billing", href: "/admin/billing", icon: "Receipt", group: "Revenue" },

  { label: "Posts", href: "/admin/posts", icon: "PenLine", group: "Content & AI" },
  { label: "Content (CMS)", href: "/admin/content", icon: "FileText", group: "Content & AI" },
  { label: "AI Providers", href: "/admin/ai", icon: "Sparkles", group: "Content & AI" },
  { label: "Broadcast", href: "/admin/broadcast", icon: "Megaphone", group: "Content & AI" },

  { label: "Feature Flags", href: "/admin/flags", icon: "ToggleRight", group: "Platform" },
  { label: "Usage & API", href: "/admin/usage", icon: "Activity", group: "Platform" },
  { label: "Connections", href: "/admin/connections", icon: "Plug", group: "Platform" },
  { label: "Notifications", href: "/admin/notifications", icon: "Bell", group: "Platform" },
  { label: "Site Settings", href: "/admin/settings", icon: "Settings", group: "Platform" },

  { label: "Support", href: "/admin/support", icon: "LifeBuoy", group: "Operations" },
  { label: "Audit Log", href: "/admin/audit", icon: "ScrollText", group: "Operations" },
  { label: "Security & Lockouts", href: "/admin/security", icon: "ShieldAlert", group: "Operations" },
  { label: "Queue Engine", href: "/admin/queue", icon: "Cpu", group: "Operations" },
  { label: "System Health", href: "/admin/system", icon: "HeartPulse", group: "Operations" },
  { label: "Health Probes", href: "/admin/health", icon: "Activity", group: "Operations" },
  { label: "Observability", href: "/admin/observability", icon: "Radio", group: "Operations" },
];
