import { describe, expect, it } from "vitest";
import {
  ADMIN_PERMISSION_DEFS,
  ALL_PERMISSIONS,
  ASSIGNABLE_PERMISSIONS,
  CUSTOM_PREFIX,
  ROUTE_PERMISSION,
  SYSTEM_ROLES,
  grantable,
  isAssignablePermission,
  isPermission,
  isSuperAdmin,
  landingFor,
  permissionForRoute,
  resolvePermissions,
} from "./admin-permissions";
import { ADMIN_NAV } from "./nav";

const NOW = new Date("2026-10-09T12:00:00Z");
const scoped = { isPlatformAdmin: true, platformRole: "scoped" };
const day = 86_400_000;

describe("permission registry", () => {
  it("has unique keys, each shaped module.action", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const k of ALL_PERMISSIONS) expect(k).toMatch(/^[a-z]+\.[a-z]+$/);
  });

  it("keeps access management out of anything assignable", () => {
    for (const k of ["access.view", "access.manage"]) {
      expect(isPermission(k)).toBe(true);
      expect(isAssignablePermission(k)).toBe(false);
      expect(ASSIGNABLE_PERMISSIONS).not.toContain(k);
    }
    expect(ADMIN_PERMISSION_DEFS.filter((d) => d.superOnly).map((d) => d.key).sort()).toEqual(["access.manage", "access.view"]);
  });

  it("no built-in role contains a super-only or unknown permission", () => {
    for (const r of SYSTEM_ROLES) for (const k of r.permissions) expect(isAssignablePermission(k), `${r.key}:${k}`).toBe(true);
  });

  it("system role keys never collide with the custom prefix", () => {
    for (const r of SYSTEM_ROLES) expect(r.key.startsWith(CUSTOM_PREFIX)).toBe(false);
  });
});

describe("resolvePermissions", () => {
  it("customers and signed-out visitors hold nothing, whatever roles they were once given", () => {
    expect(resolvePermissions(null).size).toBe(0);
    expect(resolvePermissions({ isPlatformAdmin: false, platformRole: "scoped" }, [{ roleKey: "finance" }], [], NOW).size).toBe(0);
  });

  it("an original administrator holds every permission", () => {
    const p = resolvePermissions({ isPlatformAdmin: true, platformRole: null });
    expect(p.size).toBe(ALL_PERMISSIONS.length);
    expect(isSuperAdmin({ isPlatformAdmin: true, platformRole: null })).toBe(true);
  });

  it("the legacy support tier keeps exactly the support role", () => {
    const p = resolvePermissions({ isPlatformAdmin: true, platformRole: "support" });
    expect([...p].sort()).toEqual([...SYSTEM_ROLES.find((r) => r.key === "support")!.permissions].sort());
    expect(p.has("users.view")).toBe(false);
  });

  it("role-based staff hold the union of their roles and nothing else", () => {
    const p = resolvePermissions(scoped, [{ roleKey: "finance" }, { roleKey: "content" }], [], NOW);
    expect(p.has("billing.manage")).toBe(true);
    expect(p.has("content.manage")).toBe(true);
    expect(p.has("users.manage")).toBe(false);
  });

  it("ignores revoked and expired assignments, honours ones that expire later", () => {
    const p = resolvePermissions(
      scoped,
      [
        { roleKey: "finance", revokedAt: new Date(NOW.getTime() - day) },
        { roleKey: "security", expiresAt: new Date(NOW.getTime() - 1) },
        { roleKey: "content", expiresAt: NOW },
        { roleKey: "marketing", expiresAt: new Date(NOW.getTime() + day) },
      ],
      [],
      NOW,
    );
    expect(p.has("billing.view")).toBe(false);
    expect(p.has("security.view")).toBe(false);
    expect(p.has("content.view") && !p.has("content.manage")).toBe(true); // marketing grants content.view only
    expect(p.has("marketing.manage")).toBe(true);
  });

  it("custom roles apply, but can never smuggle in a super-only or unknown permission", () => {
    const custom = [{ key: "custom:a", name: "A", permissions: ["flags.view", "access.manage", "made.up"] }];
    const p = resolvePermissions(scoped, [{ roleKey: "custom:a" }], custom, NOW);
    expect([...p]).toEqual(["flags.view"]);
  });

  it("a deleted custom role or an unknown key grants nothing", () => {
    expect(resolvePermissions(scoped, [{ roleKey: "custom:gone" }, { roleKey: "nonsense" }], [], NOW).size).toBe(0);
  });
});

describe("grantable", () => {
  const held = new Set(["flags.view", "flags.manage"] as const);
  it("allows permissions the actor holds", () => {
    expect(grantable(held, ["flags.view"])).toEqual({ ok: true });
  });
  it("refuses ones the actor lacks, unknown ones and super-only ones", () => {
    expect(grantable(held, ["billing.view"]).ok).toBe(false);
    expect(grantable(held, ["nope.view"]).ok).toBe(false);
    expect(grantable(new Set(ALL_PERMISSIONS), ["access.manage"]).ok).toBe(false);
  });
});

describe("routes", () => {
  it("maps every sidebar item to a permission", () => {
    for (const i of ADMIN_NAV) expect(permissionForRoute(i.href), i.href).not.toBeNull();
  });

  it("prefers the most specific route and respects path boundaries", () => {
    expect(permissionForRoute("/admin")).toBe("overview.view");
    expect(permissionForRoute("/admin/orgs/abc")).toBe("orgs.view");
    expect(permissionForRoute("/admin/marketing/links")).toBe("marketing.view");
    expect(permissionForRoute("/admin/broadcast")).toBe("broadcast.send");
    expect(permissionForRoute("/admin/users-archive")).toBe("overview.view"); // not a /admin/users page: falls back to the shell
    expect(permissionForRoute("/dashboard")).toBeNull();
    expect(permissionForRoute("/admin/access")).toBe("access.view");
  });

  it("only references real permissions", () => {
    for (const [, k] of ROUTE_PERMISSION) expect(isPermission(k)).toBe(true);
  });

  it("lands staff on the first page they can open", () => {
    expect(landingFor(new Set(["overview.view"]))).toBe("/admin");
    expect(landingFor(new Set(["support.view"]))).toBe("/admin/support");
    expect(landingFor(new Set(["billing.view"]))).toBe("/admin/billing");
    expect(landingFor(new Set())).toBeNull();
  });
});
