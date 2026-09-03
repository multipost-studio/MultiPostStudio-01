import type { Permission } from "@/lib/rbac";

export type NavItem = {
  label: string;
  href: string;
  icon: string; // lucide icon name
  permission?: Permission;
  /** Plan capability key (see ENTITLEMENT_GROUPS). Hidden when the org's plan lacks it. */
  entitlement?: string;
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
  { label: "API & Webhooks", href: "/settings/api", icon: "Code2" },
];

export const ADMIN_NAV: { label: string; href: string; icon: string }[] = [
  { label: "Overview", href: "/admin", icon: "Gauge" },
  { label: "Site Settings", href: "/admin/settings", icon: "Settings" },
  { label: "Users", href: "/admin/users", icon: "Users" },
  { label: "Organizations", href: "/admin/orgs", icon: "Building2" },
  { label: "Posts", href: "/admin/posts", icon: "PenLine" },
  { label: "Plans", href: "/admin/plans", icon: "CreditCard" },
  { label: "Billing", href: "/admin/billing", icon: "Receipt" },
  { label: "Content (CMS)", href: "/admin/content", icon: "FileText" },
  { label: "Referrals", href: "/admin/referrals", icon: "Gift" },
  { label: "Feature Flags", href: "/admin/flags", icon: "ToggleRight" },
  { label: "Usage & API", href: "/admin/usage", icon: "Activity" },
  { label: "Connections", href: "/admin/connections", icon: "Plug" },
  { label: "Broadcast", href: "/admin/broadcast", icon: "Megaphone" },
  { label: "Support", href: "/admin/support", icon: "LifeBuoy" },
  { label: "Audit Log", href: "/admin/audit", icon: "ScrollText" },
  { label: "System Health", href: "/admin/system", icon: "HeartPulse" },
];
