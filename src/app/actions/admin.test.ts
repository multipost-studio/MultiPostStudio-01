import { describe, it, expect, vi, beforeEach } from "vitest";
import { setUserPlatformRoleAction, setUserAdminAction } from "./admin";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/settings", () => ({ writeSettings: vi.fn() }));
vi.mock("@/lib/plans", () => ({ invalidatePlans: vi.fn() }));
vi.mock("@/lib/feature-flags", () => ({ invalidateFeatureFlags: vi.fn() }));
vi.mock("@/lib/cms", () => ({ invalidateCms: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ invalidateOrgPlan: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ applyPlan: vi.fn() }));
vi.mock("@/lib/session", () => ({ requirePlatformAdmin: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() },
  },
}));

const ADMIN = { id: "admin_1", email: "admin@test.com" };

describe("setUserPlatformRoleAction — admin tiering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as Awaited<ReturnType<typeof requirePlatformAdmin>>);
  });

  it("refuses to change your own tier", async () => {
    const res = await setUserPlatformRoleAction(ADMIN.id, "support");
    expect(res.ok).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to restrict a non-admin (nothing to restrict)", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ isPlatformAdmin: false, platformRole: null } as never);
    const res = await setUserPlatformRoleAction("user_2", "support");
    expect(res.ok).toBe(false);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("refuses to restrict the last full admin", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ isPlatformAdmin: true, platformRole: null } as never);
    vi.mocked(db.user.count).mockResolvedValue(1);
    const res = await setUserPlatformRoleAction("user_2", "support");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/last full platform admin/);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("restricts a platform admin to support tier when another full admin remains", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ isPlatformAdmin: true, platformRole: null } as never);
    vi.mocked(db.user.count).mockResolvedValue(2);
    const res = await setUserPlatformRoleAction("user_2", "support");
    expect(res.ok).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user_2" }, data: { platformRole: "support" } });
  });

  it("restores full admin access without the remaining-admin check", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ isPlatformAdmin: true, platformRole: "support" } as never);
    const res = await setUserPlatformRoleAction("user_2", null);
    expect(res.ok).toBe(true);
    expect(db.user.count).not.toHaveBeenCalled();
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user_2" }, data: { platformRole: null } });
  });
});

describe("setUserAdminAction — clears platformRole on demotion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requirePlatformAdmin).mockResolvedValue(ADMIN as Awaited<ReturnType<typeof requirePlatformAdmin>>);
  });

  it("clears a lingering support-tier flag when an admin is demoted entirely", async () => {
    vi.mocked(db.user.count).mockResolvedValue(2);
    const res = await setUserAdminAction("user_2", false);
    expect(res.ok).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user_2" },
      data: { isPlatformAdmin: false, platformRole: null },
    });
  });

  it("does not touch platformRole when promoting to admin", async () => {
    const res = await setUserAdminAction("user_2", true);
    expect(res.ok).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user_2" }, data: { isPlatformAdmin: true } });
  });
});
