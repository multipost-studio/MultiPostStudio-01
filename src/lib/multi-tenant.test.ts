import { describe, it, expect } from "vitest";
import { can, roleOutranks, assertPermission, PermissionError } from "./rbac";

/** Pure multi-tenant scoping logic modeled from ensureInWorkspace and scopedCampaignRefs */
function verifyWorkspaceBoundary(
  item: { workspaceId: string } | null,
  targetWorkspaceId: string,
): { allowed: boolean; error?: string } {
  if (!item || item.workspaceId !== targetWorkspaceId) {
    return { allowed: false, error: "Not found in this workspace" };
  }
  return { allowed: true };
}

describe("Cross-Tenant and Multi-Tenant Isolation Constraints", () => {
  it("rejects resource access when resource belongs to a foreign workspace", () => {
    const foreignPost = { id: "post_999", workspaceId: "workspace_B" };
    const check = verifyWorkspaceBoundary(foreignPost, "workspace_A");
    expect(check.allowed).toBe(false);
    expect(check.error).toBe("Not found in this workspace");
  });

  it("allows resource access when resource belongs to the active workspace", () => {
    const tenantPost = { id: "post_100", workspaceId: "workspace_A" };
    const check = verifyWorkspaceBoundary(tenantPost, "workspace_A");
    expect(check.allowed).toBe(true);
    expect(check.error).toBeUndefined();
  });

  it("Viewer role cannot perform Editor actions (content.create, content.publish, content.delete)", () => {
    expect(can("viewer", "content.create")).toBe(false);
    expect(can("viewer", "content.publish")).toBe(false);
    expect(can("viewer", "content.delete")).toBe(false);
    expect(can("viewer", "content.edit")).toBe(false);
    expect(() => assertPermission("viewer", "content.create")).toThrow(PermissionError);
  });

  it("Editor role cannot manage team members or billing", () => {
    expect(can("editor", "members.manage")).toBe(false);
    expect(can("editor", "billing.manage")).toBe(false);
    expect(can("editor", "workspace.manage")).toBe(false);
    expect(can("editor", "integrations.manage")).toBe(false);
    expect(() => assertPermission("editor", "billing.manage")).toThrow(PermissionError);
  });

  it("Manager role cannot perform Owner-only destructive actions or billing", () => {
    expect(can("manager", "billing.manage")).toBe(false);
    expect(can("manager", "admin.platform")).toBe(false);
    expect(roleOutranks("manager", "owner")).toBe(false);
    expect(roleOutranks("manager", "admin")).toBe(false);
  });

  it("Member cannot modify peer roles or elevate permissions", () => {
    expect(roleOutranks("editor", "editor")).toBe(false);
    expect(roleOutranks("creator", "creator")).toBe(false);
    expect(roleOutranks("creator", "editor")).toBe(false);
  });

  it("Normal roles (viewer, editor, creator, manager, admin) cannot access platform superadmin", () => {
    expect(can("viewer", "admin.platform")).toBe(false);
    expect(can("editor", "admin.platform")).toBe(false);
    expect(can("creator", "admin.platform")).toBe(false);
    expect(can("manager", "admin.platform")).toBe(false);
    expect(can("admin", "admin.platform")).toBe(false);
    expect(can("owner", "admin.platform")).toBe(true);
  });

  it("Client role is strictly limited to approvals and analytics view", () => {
    expect(can("client", "content.approve")).toBe(true);
    expect(can("client", "analytics.view")).toBe(true);
    expect(can("client", "content.create")).toBe(false);
    expect(can("client", "content.delete")).toBe(false);
    expect(can("client", "members.manage")).toBe(false);
    expect(can("client", "billing.manage")).toBe(false);
  });

  describe("Tenant Isolation Defense Guards", () => {
    it("assertTenantIsolation throws on mismatched tenant IDs", async () => {
      const { assertTenantIsolation, TenantIsolationError } = await import("@/lib/tenant-guards");

      expect(() => {
        assertTenantIsolation("workspace_victim", "workspace_attacker", "post");
      }).toThrow(TenantIsolationError);

      expect(() => {
        assertTenantIsolation("org_victim", "org_attacker", "membership");
      }).toThrow("Unauthorized cross-tenant access to membership");

      expect(() => {
        assertTenantIsolation("workspace_A", "workspace_A", "post");
      }).not.toThrow();
    });

    it("verifies organization boundary for org-scoped entities", async () => {
      const { verifyOrgBoundary } = await import("@/lib/tenant-guards");

      const foreignMember = { id: "mem_222", orgId: "org_B" };
      expect(verifyOrgBoundary(foreignMember, "org_A").allowed).toBe(false);
      expect(verifyOrgBoundary(foreignMember, "org_A").error).toBe("Not found in this organization");

      const foreignApiKey = { id: "key_333", orgId: "org_B" };
      expect(verifyOrgBoundary(foreignApiKey, "org_A").allowed).toBe(false);

      const localMember = { id: "mem_111", orgId: "org_A" };
      expect(verifyOrgBoundary(localMember, "org_A").allowed).toBe(true);
    });

    it("prevents foreign workspace references from polluting campaign associations", async () => {
      const { filterWorkspaceRef } = await import("@/lib/tenant-guards");

      const foreignCampaign = { id: "cmp_cross_tenant", workspaceId: "workspace_B" };
      expect(filterWorkspaceRef(foreignCampaign, "workspace_A")).toBeNull();

      const localCampaign = { id: "cmp_valid", workspaceId: "workspace_A" };
      expect(filterWorkspaceRef(localCampaign, "workspace_A")).toBe("cmp_valid");
    });
  });
});

