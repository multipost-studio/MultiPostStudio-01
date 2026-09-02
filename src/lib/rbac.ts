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
