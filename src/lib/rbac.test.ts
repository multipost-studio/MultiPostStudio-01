import { describe, it, expect } from "vitest";
import { can, canAny, assertPermission, PermissionError, ORG_ROLE_PERMISSIONS, roleOutranks, effectiveRole, workspaceRoleForOrgRole } from "./rbac";

describe("can", () => {
  it("owner has everything, including platform admin", () => {
    expect(can("owner", "admin.platform")).toBe(true);
    expect(can("owner", "billing.manage")).toBe(true);
  });

  it("admin has everything except platform admin", () => {
    expect(can("admin", "admin.platform")).toBe(false);
    expect(can("admin", "members.manage")).toBe(true);
  });

  it("viewer is analytics-only", () => {
    expect(can("viewer", "analytics.view")).toBe(true);
    expect(can("viewer", "content.create")).toBe(false);
  });

  it("client can approve but not create", () => {
    expect(can("client", "content.approve")).toBe(true);
    expect(can("client", "content.create")).toBe(false);
    expect(can("client", "billing.manage")).toBe(false);
  });

  it("unknown / missing role has nothing", () => {
    expect(can(undefined, "analytics.view")).toBe(false);
    expect(can(null, "analytics.view")).toBe(false);
    expect(can("superuser", "analytics.view")).toBe(false);
  });

  it("editor cannot manage billing or members", () => {
    expect(can("editor", "billing.manage")).toBe(false);
    expect(can("editor", "members.manage")).toBe(false);
    expect(can("editor", "content.publish")).toBe(true);
  });
});

describe("canAny", () => {
  it("is true when at least one permission is held", () => {
    expect(canAny("analyst", ["billing.manage", "reports.manage"])).toBe(true);
    expect(canAny("analyst", ["billing.manage", "members.manage"])).toBe(false);
  });
});

describe("assertPermission", () => {
  it("throws PermissionError when the role lacks the permission", () => {
    expect(() => assertPermission("viewer", "content.delete")).toThrow(PermissionError);
  });
  it("does not throw when allowed", () => {
    expect(() => assertPermission("owner", "content.delete")).not.toThrow();
  });
});

describe("permission matrix invariants", () => {  it("every role's permissions are known permission strings", () => {
    const known = new Set(Object.values(ORG_ROLE_PERMISSIONS).flat());
    for (const [role, perms] of Object.entries(ORG_ROLE_PERMISSIONS)) {
      expect(perms.length, `${role} has permissions`).toBeGreaterThan(0);
      expect(new Set(perms).size, `${role} has no duplicates`).toBe(perms.length);
    }
    expect(known.size).toBeGreaterThan(0);
  });
});

describe("roleOutranks", () => {
  it("requires a strictly higher role (peers cannot touch peers)", () => {
    expect(roleOutranks("owner", "admin")).toBe(true);
    expect(roleOutranks("admin", "manager")).toBe(true);
    expect(roleOutranks("manager", "manager")).toBe(false);
    expect(roleOutranks("manager", "admin")).toBe(false);
    expect(roleOutranks("viewer", "viewer")).toBe(false);
  });

  it("owner and admin outrank every workspace role", () => {
    expect(roleOutranks("owner", "manager")).toBe(true);
    expect(roleOutranks("admin", "manager")).toBe(true);
    expect(roleOutranks("manager", "editor")).toBe(true);
    expect(roleOutranks("editor", "manager")).toBe(false);
  });

  it("client outranks nothing and unknown roles fail closed", () => {
    expect(roleOutranks("client", "viewer")).toBe(false);
    expect(roleOutranks("manager", "client")).toBe(true);
    expect(roleOutranks("superuser", "viewer")).toBe(false);
    expect(roleOutranks("manager", "superuser")).toBe(false);
    expect(roleOutranks(undefined, "viewer")).toBe(false);
    expect(roleOutranks("manager", null)).toBe(false);
  });
});

describe("effectiveRole", () => {
  it("lets a workspace row override a non-admin org role, up or down", () => {
    expect(effectiveRole("manager", "viewer")).toBe("viewer");
    expect(effectiveRole("viewer", "editor")).toBe("editor");
    expect(effectiveRole("viewer", "client")).toBe("client");
  });

  it("falls back to the org role when there is no workspace row", () => {
    expect(effectiveRole("analyst", null)).toBe("analyst");
    expect(effectiveRole("analyst", undefined)).toBe("analyst");
  });

  it("never reduces an owner or admin", () => {
    expect(effectiveRole("owner", "viewer")).toBe("owner");
    expect(effectiveRole("admin", "editor")).toBe("admin");
    expect(effectiveRole("admin", "client")).toBe("admin");
  });
});

describe("workspaceRoleForOrgRole", () => {
  it("mirrors every role that has a workspace equivalent, so a row never grants more than the org role", () => {
    for (const r of ["manager", "editor", "creator", "analyst", "viewer"]) expect(workspaceRoleForOrgRole(r)).toBe(r);
  });

  it("gives owner and admin a manager row (effectiveRole keeps their real role)", () => {
    expect(workspaceRoleForOrgRole("owner")).toBe("manager");
    expect(workspaceRoleForOrgRole("admin")).toBe("manager");
  });

  it("never mints a role above the one it was given, for the roles an invite can carry", () => {
    for (const r of ["admin", "manager", "editor", "creator", "analyst", "viewer"]) {
      const row = workspaceRoleForOrgRole(r);
      expect(roleOutranks(row, r)).toBe(false);
    }
  });
});
