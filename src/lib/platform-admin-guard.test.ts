import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  session: null as unknown,
  user: null as unknown,
  assignments: [] as unknown[],
  roles: [] as unknown[],
}));

class Redirected extends Error {
  constructor(public to: string) {
    super(`NEXT_REDIRECT:${to}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirected(to);
  },
}));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => m.session) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/impersonation", () => ({ verifyImpersonationToken: vi.fn(() => null), IMPERSONATION_COOKIE: "imp" }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(async () => m.user) },
    adminRoleAssignment: { findMany: vi.fn(async () => m.assignments) },
    adminCustomRole: { findMany: vi.fn(async () => m.roles) },
  },
}));

import { getStaffPermissions, hasAdminPermission, isFullPlatformAdmin, requireAdminAccess, requireAdminPermission, requirePlatformAdmin } from "./session";

const signedIn = (u: Record<string, unknown> | null) => {
  m.session = u ? { user: { id: "u1" } } : null;
  m.user = u && { id: "u1", email: "a@b.co", name: "A", image: null, suspendedAt: null, deletedAt: null, ...u };
};
const redirectTarget = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    if (e instanceof Redirected) return e.to;
    throw e;
  }
};

beforeEach(() => {
  vi.clearAllMocks();
  m.assignments = [];
  m.roles = [];
});

describe("requirePlatformAdmin (super-only work: roles, admin accounts, impersonation)", () => {
  it("passes for a full administrator", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: null });
    expect(await redirectTarget(requirePlatformAdmin())).toBeNull();
  });

  it("turns away support and role-based staff, sending them to a page they can use", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: "support" });
    expect(await redirectTarget(requirePlatformAdmin())).toBe("/admin/support");
    signedIn({ isPlatformAdmin: true, platformRole: "scoped" });
    m.assignments = [{ roleKey: "finance", expiresAt: null, revokedAt: null }];
    expect(await redirectTarget(requirePlatformAdmin())).toBe("/admin");
  });

  it("an ordinary customer goes to the app; a signed-out visitor to login", async () => {
    signedIn({ isPlatformAdmin: false, platformRole: null });
    expect(await redirectTarget(requirePlatformAdmin())).toBe("/dashboard");
    signedIn(null);
    expect(await redirectTarget(requirePlatformAdmin())).toBe("/login");
  });
});

describe("requireAdminPermission", () => {
  it("a full administrator holds everything", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: null });
    expect(await redirectTarget(requireAdminPermission("billing.manage"))).toBeNull();
    expect(await redirectTarget(requireAdminPermission("access.manage"))).toBeNull();
  });

  it("the built-in support role opens support and nothing else", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: "support" });
    expect(await redirectTarget(requireAdminPermission("support.manage"))).toBeNull();
    expect(await redirectTarget(requireAdminPermission("users.view"))).toBe("/admin/support");
  });

  it("a role-based staff member holds exactly the permissions of their roles", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: "scoped" });
    m.assignments = [{ roleKey: "finance", expiresAt: null, revokedAt: null }];
    expect(await redirectTarget(requireAdminPermission("billing.view"))).toBeNull();
    expect(await redirectTarget(requireAdminPermission("users.manage"))).toBe("/admin");
    expect(await redirectTarget(requireAdminPermission("access.view"))).toBe("/admin");
  });

  it("custom roles apply, and an unknown or deleted custom role grants nothing", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: "scoped" });
    m.assignments = [{ roleKey: "custom:abc", expiresAt: null, revokedAt: null }];
    m.roles = [{ key: "custom:abc", name: "Flags only", permissions: JSON.stringify(["flags.view", "flags.manage"]) }];
    expect(await redirectTarget(requireAdminPermission("flags.manage"))).toBeNull();
    m.roles = [];
    expect(await redirectTarget(requireAdminPermission("flags.manage"))).toBe("/dashboard");
  });

  it("a staff member with no roles has no admin access at all", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: "scoped" });
    expect(await redirectTarget(requireAdminPermission("overview.view"))).toBe("/dashboard");
    expect(await redirectTarget(requireAdminAccess())).toBe("/dashboard");
  });

  it("a customer is always sent to the app", async () => {
    signedIn({ isPlatformAdmin: false, platformRole: "scoped" });
    expect(await redirectTarget(requireAdminPermission("overview.view"))).toBe("/dashboard");
  });
});

describe("getStaffPermissions and hasAdminPermission", () => {
  it("reads only active, unexpired assignments from the database", async () => {
    signedIn({ isPlatformAdmin: true, platformRole: "scoped" });
    m.assignments = [
      { roleKey: "security", expiresAt: new Date(Date.now() + 60_000), revokedAt: null },
      { roleKey: "finance", expiresAt: new Date(Date.now() - 60_000), revokedAt: null },
      { roleKey: "content", expiresAt: null, revokedAt: new Date() },
    ];
    const perms = await getStaffPermissions();
    expect(perms.has("security.view")).toBe(true);
    expect(perms.has("billing.view")).toBe(false);
    expect(perms.has("content.manage")).toBe(false);
    expect(await hasAdminPermission("security.view")).toBe(true);
  });

  it("a customer has none", async () => {
    signedIn({ isPlatformAdmin: false, platformRole: null });
    expect((await getStaffPermissions()).size).toBe(0);
    expect(await hasAdminPermission("overview.view")).toBe(false);
  });
});

describe("isFullPlatformAdmin (for routes that answer with a status code)", () => {
  it("is true only for a full administrator", () => {
    expect(isFullPlatformAdmin({ isPlatformAdmin: true, platformRole: null })).toBe(true);
    expect(isFullPlatformAdmin({ isPlatformAdmin: true })).toBe(true);
    expect(isFullPlatformAdmin({ isPlatformAdmin: true, platformRole: "support" })).toBe(false);
    expect(isFullPlatformAdmin({ isPlatformAdmin: true, platformRole: "scoped" })).toBe(false);
    expect(isFullPlatformAdmin({ isPlatformAdmin: false, platformRole: null })).toBe(false);
    expect(isFullPlatformAdmin(null)).toBe(false);
    expect(isFullPlatformAdmin(undefined)).toBe(false);
  });
});
