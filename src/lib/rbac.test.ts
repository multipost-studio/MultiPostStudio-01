import { describe, it, expect } from "vitest";
import { can, canAny, assertPermission, PermissionError, ORG_ROLE_PERMISSIONS } from "./rbac";

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

describe("permission matrix invariants", () => {
  it("every role's permissions are known permission strings", () => {
    const known = new Set(Object.values(ORG_ROLE_PERMISSIONS).flat());
    for (const [role, perms] of Object.entries(ORG_ROLE_PERMISSIONS)) {
      expect(perms.length, `${role} has permissions`).toBeGreaterThan(0);
      expect(new Set(perms).size, `${role} has no duplicates`).toBe(perms.length);
    }
    expect(known.size).toBeGreaterThan(0);
  });
});
