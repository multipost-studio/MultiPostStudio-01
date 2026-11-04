import { db } from "@/lib/db";
import { effectiveRole, permissionSet } from "@/lib/rbac";
import { parseJson } from "@/lib/utils";

/** The permission that lets a person connect an assistant in the first place (the same one that creates an API key). */
const PERMISSION = "integrations.manage" as const;

/**
 * Is the person who approved a connection still allowed to have approved it? Checked on every request and every refresh, so a
 * connection does not outlive its approver: if they leave the organisation, are suspended, are demoted below "owner/admin/manager",
 * or lose access to the one workspace it was limited to, the connection stops working.
 *
 * Uses the same rule as the consent screen (see grantTargets in consent.ts): organisation-wide connections need the permission at
 * organisation level; a one-workspace connection needs it in that workspace.
 */
export async function grantStillAllowed(grant: { userId: string; orgId: string; workspaceId: string | null }): Promise<boolean> {
  const mem = await db.membership.findFirst({
    where: { orgId: grant.orgId, userId: grant.userId, status: "active" },
    select: { role: true, customRole: { select: { permissions: true } } },
  });
  if (!mem) return false;
  const parsed = mem.customRole ? parseJson<unknown>(mem.customRole.permissions, null) : null;
  const custom = Array.isArray(parsed) ? parsed.map(String) : null;

  if (!grant.workspaceId) return permissionSet(mem.role, custom).has(PERMISSION);

  const ws = await db.workspace.findFirst({
    where: { id: grant.workspaceId, orgId: grant.orgId },
    select: { members: { where: { userId: grant.userId }, select: { role: true }, take: 1 } },
  });
  if (!ws) return false;
  return permissionSet(effectiveRole(mem.role, ws.members[0]?.role ?? null), custom).has(PERMISSION);
}
