/**
 * Multi-tenant isolation guards.
 *
 * Enforces strict workspace and organization boundaries across all
 * database queries, server actions, and background workers.
 */

export class TenantIsolationError extends Error {
  constructor(message = "Unauthorized cross-tenant access") {
    super(message);
    this.name = "TenantIsolationError";
  }
}

/** Assert tenant isolation for arbitrary in-memory or retrieved records */
export function assertTenantIsolation(
  tenantId: string,
  expectedTenantId: string,
  resourceName = "resource",
): void {
  if (!tenantId || !expectedTenantId || tenantId !== expectedTenantId) {
    throw new TenantIsolationError(`Unauthorized cross-tenant access to ${resourceName}`);
  }
}

/** Pure verification of workspace boundary */
export function verifyWorkspaceBoundary(
  item: { workspaceId: string } | null | undefined,
  targetWorkspaceId: string,
): { allowed: boolean; error?: string } {
  if (!item || item.workspaceId !== targetWorkspaceId) {
    return { allowed: false, error: "Not found in this workspace" };
  }
  return { allowed: true };
}

/** Pure verification of organization boundary */
export function verifyOrgBoundary(
  item: { orgId: string } | null | undefined,
  targetOrgId: string,
): { allowed: boolean; error?: string } {
  if (!item || item.orgId !== targetOrgId) {
    return { allowed: false, error: "Not found in this organization" };
  }
  return { allowed: true };
}

/**
 * Filter client-supplied references to guarantee they belong to the active workspace.
 * Foreign IDs are stripped to prevent cross-tenant association pollution.
 */
export function filterWorkspaceRef(
  entity: { id: string; workspaceId: string } | null | undefined,
  activeWorkspaceId: string,
): string | null {
  if (!entity || entity.workspaceId !== activeWorkspaceId) return null;
  return entity.id;
}
