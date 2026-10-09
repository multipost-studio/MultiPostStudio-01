/**
 * Admin access control: one registry of permissions, a few built-in roles, optional custom roles, and a pure
 * function that turns "who is this staff member" into the set of things they may do.
 *
 * Pure (no database, no framework) so the same definitions drive the server guards, the sidebar and the tests.
 * The guards in src/lib/session.ts are authoritative; the sidebar only hides what a person cannot use.
 *
 * How a staff member's permissions are decided:
 *  - not platform staff                         -> nothing
 *  - platformRole null  (every existing admin)  -> everything. Nobody's access changed when this model arrived.
 *  - platformRole "support"                     -> the built-in support role, plus any assigned roles
 *  - platformRole "scoped"                      -> only the roles assigned to them (built-in or custom), unexpired
 * Permissions marked `superOnly` can never be placed in a role, so no role (and nobody who can edit roles) can
 * hand out the ability to manage access, admin accounts or customer impersonation.
 */

export type PermissionDef = { key: string; label: string; module: string; sensitive?: boolean; superOnly?: boolean };

const P = (key: string, label: string, module: string, extra: Partial<PermissionDef> = {}): PermissionDef => ({ key, label, module, ...extra });

export const ADMIN_PERMISSION_DEFS = [
  P("overview.view", "View the overview dashboard", "Overview"),

  P("users.view", "View users", "People"),
  P("users.manage", "Suspend, delete, restore, verify users and revoke devices", "People", { sensitive: true }),
  P("notes.view", "Read internal notes on users and organizations", "People"),
  P("notes.manage", "Add, pin and delete internal notes", "People"),
  P("orgs.view", "View organizations", "People"),
  P("orgs.manage", "Suspend, delete, restore organizations; change plan, credits and details", "People", { sensitive: true }),
  P("affiliates.view", "View affiliates", "People"),
  P("affiliates.manage", "Approve affiliates, commissions and payouts", "People", { sensitive: true }),

  P("billing.view", "View revenue, billing and plans", "Revenue"),
  P("billing.manage", "Change invoice or subscription status, credits and coupons", "Revenue", { sensitive: true }),
  P("plans.manage", "Create, edit and delete plans", "Revenue", { sensitive: true }),

  P("marketing.view", "View marketing, branding and reviews", "Marketing"),
  P("marketing.manage", "Edit marketing, branding, promo cards, festival themes, footer and reviews", "Marketing"),
  P("broadcast.send", "Send broadcast messages to users", "Marketing", { sensitive: true }),

  P("content.view", "View the blog and CMS", "Content"),
  P("content.manage", "Edit blog posts, taxonomy, comments, media and CMS", "Content"),

  P("posts.view", "View customers' posts", "Social & AI"),
  P("posts.manage", "Archive customers' posts", "Social & AI", { sensitive: true }),
  P("queue.view", "View the publishing queue", "Social & AI"),
  P("queue.manage", "Retry, cancel and reschedule publishing jobs; run the queue", "Social & AI", { sensitive: true }),
  P("integrations.view", "View connections, API keys and webhooks", "Social & AI"),
  P("integrations.manage", "Disconnect social accounts, revoke API keys, toggle webhooks", "Social & AI", { sensitive: true }),
  P("ai.view", "View AI provider status", "Social & AI"),

  P("flags.view", "View feature flags and kill switches", "Platform"),
  P("flags.manage", "Change feature flags and rollouts", "Platform", { sensitive: true }),
  P("usage.view", "View usage and API metrics", "Platform"),
  P("notifications.view", "View the admin notification centre", "Platform"),
  P("config.view", "View the history of configuration changes", "Platform"),
  P("settings.view", "View site settings and platform rules", "Platform"),
  P("settings.manage", "Change site settings and platform rules", "Platform", { sensitive: true }),

  P("support.view", "View support tickets", "Operations"),
  P("support.manage", "Reply to, assign and close support tickets", "Operations"),
  P("privacy.view", "View privacy requests", "Operations"),
  P("privacy.manage", "Process privacy requests", "Operations", { sensitive: true }),
  P("audit.view", "View the audit log", "Operations"),
  P("security.view", "View security events, lockouts and sessions", "Operations"),
  P("security.manage", "Unlock accounts and clear lockouts", "Operations", { sensitive: true }),
  P("system.view", "View system health, probes and observability", "Operations"),
  P("system.manage", "Run probes, change health settings, purge events", "Operations"),
  P("data.export", "Export platform data", "Operations", { sensitive: true }),

  // Never assignable to a role: only the original full administrators hold these.
  P("access.view", "View admin roles and access", "Access", { superOnly: true }),
  P("access.manage", "Create roles and grant admin access", "Access", { sensitive: true, superOnly: true }),
] as const satisfies readonly PermissionDef[];

export type AdminPermission = (typeof ADMIN_PERMISSION_DEFS)[number]["key"];

export const ALL_PERMISSIONS: readonly AdminPermission[] = ADMIN_PERMISSION_DEFS.map((d) => d.key);
const DEF_BY_KEY: ReadonlyMap<string, PermissionDef> = new Map(ADMIN_PERMISSION_DEFS.map((d) => [d.key, d]));

export const isPermission = (v: unknown): v is AdminPermission => typeof v === "string" && DEF_BY_KEY.has(v);
export const isAssignablePermission = (v: unknown): v is AdminPermission => isPermission(v) && !DEF_BY_KEY.get(v)!.superOnly;
export const permissionDef = (key: string): PermissionDef | undefined => DEF_BY_KEY.get(key);
export const ASSIGNABLE_PERMISSIONS: readonly AdminPermission[] = ALL_PERMISSIONS.filter(isAssignablePermission);

const VIEW_KEYS = ASSIGNABLE_PERMISSIONS.filter((k) => k.endsWith(".view"));

export type SystemRole = { key: string; name: string; description: string; permissions: readonly AdminPermission[] };

/** Built-in roles. Defined in code, so they cannot be edited or deleted from the database. */
export const SYSTEM_ROLES: readonly SystemRole[] = [
  { key: "support", name: "Support", description: "Works the support desk only.", permissions: ["support.view", "support.manage"] },
  {
    key: "finance",
    name: "Finance",
    description: "Revenue, billing, plans and coupons, with organization context.",
    permissions: ["overview.view", "billing.view", "billing.manage", "orgs.view", "audit.view", "notes.view"],
  },
  {
    key: "security",
    name: "Security",
    description: "Security events, lockouts, privacy requests and the audit trail.",
    permissions: ["security.view", "security.manage", "audit.view", "users.view", "system.view", "privacy.view", "privacy.manage", "notes.view"],
  },
  {
    key: "operations",
    name: "Operations",
    description: "Publishing queue, integrations, system health and notifications.",
    permissions: ["overview.view", "queue.view", "queue.manage", "integrations.view", "system.view", "system.manage", "posts.view", "notifications.view", "flags.view", "usage.view", "config.view"],
  },
  { key: "content", name: "Content", description: "Blog, CMS and customers' posts (read).", permissions: ["content.view", "content.manage", "posts.view"] },
  {
    key: "marketing",
    name: "Marketing",
    description: "Marketing pages, branding, reviews, broadcasts and the blog (read).",
    permissions: ["marketing.view", "marketing.manage", "broadcast.send", "content.view", "config.view"],
  },
  { key: "readonly", name: "Read-only operator", description: "Can look at every area, change nothing.", permissions: VIEW_KEYS },
];

const SYSTEM_BY_KEY: ReadonlyMap<string, SystemRole> = new Map(SYSTEM_ROLES.map((r) => [r.key, r]));
export const systemRole = (key: string): SystemRole | undefined => SYSTEM_BY_KEY.get(key);

export type CustomRole = { key: string; name: string; permissions: readonly string[] };
export type Assignment = { roleKey: string; expiresAt?: Date | null; revokedAt?: Date | null };
export type StaffIdentity = { isPlatformAdmin: boolean; platformRole?: string | null };

/** Keys that identify a custom role in an assignment. System role keys never start with this. */
export const CUSTOM_PREFIX = "custom:";

export function resolvePermissions(
  user: StaffIdentity | null | undefined,
  assignments: readonly Assignment[] = [],
  customRoles: readonly CustomRole[] = [],
  now: Date = new Date(),
): ReadonlySet<AdminPermission> {
  if (!user?.isPlatformAdmin) return new Set();
  if (user.platformRole == null) return new Set(ALL_PERMISSIONS);

  const out = new Set<AdminPermission>();
  const add = (keys: readonly string[]) => keys.filter(isAssignablePermission).forEach((k) => out.add(k));

  if (user.platformRole === "support") add(SYSTEM_BY_KEY.get("support")!.permissions);
  const customByKey = new Map(customRoles.map((r) => [r.key, r]));
  for (const a of assignments) {
    if (a.revokedAt) continue;
    if (a.expiresAt && a.expiresAt.getTime() <= now.getTime()) continue;
    const sys = SYSTEM_BY_KEY.get(a.roleKey);
    if (sys) add(sys.permissions);
    else if (a.roleKey.startsWith(CUSTOM_PREFIX)) add(customByKey.get(a.roleKey)?.permissions ?? []);
  }
  return out;
}

/** True only for the original, unrestricted administrators. */
export const isSuperAdmin = (user: StaffIdentity | null | undefined): boolean => !!user && user.isPlatformAdmin && user.platformRole == null;

/** Sidebar and landing: which permission opens each admin route. Longest matching prefix wins. */
export const ROUTE_PERMISSION: ReadonlyArray<readonly [string, AdminPermission]> = [
  ["/admin/marketing", "marketing.view"],
  ["/admin/promo-cards", "marketing.view"],
  ["/admin/festivals", "marketing.view"],
  ["/admin/footer", "marketing.view"],
  ["/admin/branding", "marketing.view"],
  ["/admin/reviews", "marketing.view"],
  ["/admin/broadcast", "broadcast.send"],
  ["/admin/users", "users.view"],
  ["/admin/orgs", "orgs.view"],
  ["/admin/affiliates", "affiliates.view"],
  ["/admin/revenue", "billing.view"],
  ["/admin/plans", "billing.view"],
  ["/admin/billing", "billing.view"],
  ["/admin/blog", "content.view"],
  ["/admin/content", "content.view"],
  ["/admin/posts", "posts.view"],
  ["/admin/ai", "ai.view"],
  ["/admin/flags", "flags.view"],
  ["/admin/usage", "usage.view"],
  ["/admin/connections", "integrations.view"],
  ["/admin/notifications", "notifications.view"],
  ["/admin/settings", "settings.view"],
  ["/admin/platform-rules", "settings.view"],
  ["/admin/design-system", "settings.view"],
  ["/admin/support", "support.view"],
  ["/admin/privacy-requests", "privacy.view"],
  ["/admin/audit", "audit.view"],
  ["/admin/security", "security.view"],
  ["/admin/queue", "queue.view"],
  ["/admin/system", "system.view"],
  ["/admin/health", "system.view"],
  ["/admin/observability", "system.view"],
  ["/admin/automations", "system.view"],
  ["/admin/config-history", "config.view"],
  ["/admin/recovery", "system.view"],
  ["/admin/policies", "privacy.view"],
  ["/admin/access", "access.view"],
  ["/admin", "overview.view"],
];

export function permissionForRoute(pathname: string): AdminPermission | null {
  let best: { prefix: string; key: AdminPermission } | null = null;
  for (const [prefix, key] of ROUTE_PERMISSION) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) if (!best || prefix.length > best.prefix.length) best = { prefix, key };
  }
  return best?.key ?? null;
}

/** First admin page this set of permissions opens, for redirecting someone who stepped onto a page they cannot use. */
export function landingFor(perms: ReadonlySet<AdminPermission>): string | null {
  const order = ["/admin", "/admin/support", "/admin/queue", "/admin/billing", "/admin/security", "/admin/blog", "/admin/marketing", "/admin/audit", "/admin/system"];
  for (const href of order) {
    const k = permissionForRoute(href);
    if (k && perms.has(k)) return href;
  }
  for (const [href, k] of ROUTE_PERMISSION) if (perms.has(k)) return href;
  return null;
}

/** Can `actor` put these permissions into a role? Only ones they hold themselves, and never a super-only one. */
export function grantable(actorPerms: ReadonlySet<AdminPermission>, wanted: readonly string[]): { ok: true } | { ok: false; reason: string } {
  for (const k of wanted) {
    if (!isPermission(k)) return { ok: false, reason: `Unknown permission "${k}"` };
    if (!isAssignablePermission(k)) return { ok: false, reason: `"${k}" can't be given to a role` };
    if (!actorPerms.has(k)) return { ok: false, reason: `You can't grant "${k}" because you don't hold it yourself` };
  }
  return { ok: true };
}
