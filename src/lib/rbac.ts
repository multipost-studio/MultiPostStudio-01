// Role-based access control. Permission matrix keyed by org role.
// Workspace roles inherit a subset; `client` is intentionally narrow.

export const PERMISSIONS = [
  "workspace.manage",
  "workspace.create",
  "members.manage",
  "billing.manage",
  "channels.connect",
  "content.create",
  "content.edit",
  "content.delete",
  "content.publish",
  "content.approve",
  "approvals.configure",
  "inbox.respond",
  "inbox.assign",
  "analytics.view",
  "reports.manage",
  "automations.manage",
  "integrations.manage",
  "media.manage",
  "agency.manage",
  "admin.platform",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

export const ORG_ROLE_PERMISSIONS: Record<string, Permission[]> = {
  owner: ALL,
  admin: ALL.filter((p) => p !== "admin.platform"),
  manager: [
    "workspace.manage",
    "workspace.create",
    "members.manage",
    "channels.connect",
    "content.create",
    "content.edit",
    "content.delete",
    "content.publish",
    "content.approve",
    "approvals.configure",
    "inbox.respond",
    "inbox.assign",
    "analytics.view",
    "reports.manage",
    "automations.manage",
    "integrations.manage",
    "media.manage",
    "agency.manage",
  ],
  editor: [
    "content.create",
    "content.edit",
    "content.delete",
    "content.publish",
    "inbox.respond",
    "analytics.view",
    "media.manage",
  ],
  creator: ["content.create", "content.edit", "inbox.respond", "analytics.view", "media.manage"],
  analyst: ["analytics.view", "reports.manage"],
  viewer: ["analytics.view"],
  // workspace-only role
  client: ["content.approve", "analytics.view"],
};

const PERM_SET = new Set<string>(PERMISSIONS);

/** Effective permissions: a custom role's explicit list wins over the built-in matrix. */
export function permissionSet(
  role: string | undefined | null,
  customPermissions?: string[] | null,
): Set<Permission> {
  if (Array.isArray(customPermissions)) {
    return new Set(customPermissions.filter((p): p is Permission => PERM_SET.has(p)));
  }
  return new Set(role ? ORG_ROLE_PERMISSIONS[role] ?? [] : []);
}

export function can(role: string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (ORG_ROLE_PERMISSIONS[role] ?? []).includes(permission);
}

export function canAny(role: string | undefined | null, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

export function assertPermission(role: string | undefined | null, permission: Permission): void {
  if (!can(role, permission)) {
    throw new PermissionError(permission);
  }
}

export class PermissionError extends Error {
  constructor(public permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = "PermissionError";
  }
}

/**
 * Authority ladder for approval stage gates.
 *
 * `client` is deliberately absent: it is not a rank but a distinct external
 * role. A manager must not be able to satisfy a client sign-off, and a client
 * must not satisfy a manager stage.
 */
const STAGE_RANK: Record<string, number> = {
  owner: 6,
  admin: 5,
  manager: 4,
  editor: 3,
  creator: 2,
  analyst: 1,
  viewer: 0,
};

/**
 * May a user with `role` act on an approval stage gated to `roleGate`?
 *
 * ApprovalStage.roleGate holds a WORKSPACE_ROLES value ("role required to act
 * at this stage"), so a hierarchical gate is satisfied by that role or higher.
 *
 * Fails closed: an unknown role or gate returns false rather than allowing the
 * action. decideApprovalAction previously checked only the generic
 * `content.approve` permission and ignored the stage gate entirely, so any
 * approver could clear an owner-only or client-only stage.
 */
export function canActAtStage(role: string | undefined | null, roleGate: string | undefined | null): boolean {
  if (!role || !roleGate) return false;

  // A client sign-off must come from the client, and a client may not stand in
  // for an internal stage.
  if (roleGate === "client" || role === "client") return role === roleGate;

  const has = STAGE_RANK[role];
  const needs = STAGE_RANK[roleGate];
  if (has === undefined || needs === undefined) return false;
  return has >= needs;
}
