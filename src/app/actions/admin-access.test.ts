import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ perms: new Set<string>() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({ createNotification: vi.fn().mockResolvedValue({ created: true, id: "n1" }) }));
vi.mock("@/lib/session", () => ({
  requirePlatformAdmin: vi.fn(async () => ({ id: "admin1", isPlatformAdmin: true, platformRole: null })),
  getStaffPermissions: vi.fn(async () => m.perms),
}));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn(), update: vi.fn((a: unknown) => ({ op: "user.update", a })) },
    adminCustomRole: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn((a: unknown) => ({ op: "role.delete", a })) },
    adminRoleAssignment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn((a: unknown) => ({ op: "assign.create", a })),
      update: vi.fn(),
      updateMany: vi.fn(() => ({ op: "assign.updateMany", count: 2 })),
    },
    $transaction: vi.fn(async (ops: unknown[]) => (ops[0] && (ops[0] as { op?: string }).op === "assign.updateMany" ? [{ count: 2 }, {}] : ops)),
  },
}));

import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { createNotification } from "@/lib/notifications/service";
import { requirePlatformAdmin } from "@/lib/session";
import { ALL_PERMISSIONS } from "@/lib/admin-permissions";
import { assignAdminRoleAction, createCustomRoleAction, deleteCustomRoleAction, revokeAdminRoleAction, updateCustomRoleAction } from "./admin-access";

const REASON = "Quarterly finance support cover";
const target = { id: "u2", name: "Sam", email: "sam@co.com", isPlatformAdmin: false, platformRole: null, emailVerified: new Date(), suspendedAt: null, deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  m.perms = new Set(ALL_PERMISSIONS);
  vi.mocked(requirePlatformAdmin).mockResolvedValue({ id: "admin1" } as never);
  vi.mocked(db.adminCustomRole.findMany).mockResolvedValue([] as never);
  vi.mocked(db.adminCustomRole.findUnique).mockResolvedValue(null as never);
  vi.mocked(db.adminCustomRole.create).mockResolvedValue({ id: "r1", key: "custom:abc", name: "Flag ops" } as never);
  vi.mocked(db.user.findUnique).mockResolvedValue(target as never);
  vi.mocked(db.adminRoleAssignment.findFirst).mockResolvedValue(null as never);
});

describe("custom roles", () => {
  const input = { name: "Flag ops", description: "Flags only", permissions: ["flags.view", "flags.manage"], reason: REASON };

  it("is refused before anything is read when the caller is not a full administrator", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(createCustomRoleAction(input)).rejects.toThrow("NEXT_REDIRECT");
    expect(db.adminCustomRole.create).not.toHaveBeenCalled();
  });

  it("creates a role with a generated custom key and audits it with the reason", async () => {
    const r = await createCustomRoleAction(input);
    expect(r).toMatchObject({ ok: true });
    const data = vi.mocked(db.adminCustomRole.create).mock.calls[0][0].data;
    expect(data.key).toMatch(/^custom:[0-9a-f-]{12}$/);
    expect(JSON.parse(data.permissions)).toEqual(["flags.view", "flags.manage"]);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin1", action: "admin.role_created", metadata: expect.objectContaining({ reason: REASON }) }));
  });

  it("rejects super-only, unknown and empty permission lists, and a missing reason", async () => {
    expect(await createCustomRoleAction({ ...input, permissions: ["access.manage"] })).toMatchObject({ ok: false });
    expect(await createCustomRoleAction({ ...input, permissions: ["nope.view"] })).toMatchObject({ ok: false });
    expect(await createCustomRoleAction({ ...input, permissions: [] })).toMatchObject({ ok: false });
    expect(await createCustomRoleAction({ ...input, reason: "short" })).toMatchObject({ ok: false });
    expect(db.adminCustomRole.create).not.toHaveBeenCalled();
  });

  it("refuses permissions the actor does not hold", async () => {
    m.perms = new Set(["flags.view"]);
    expect(await createCustomRoleAction(input)).toMatchObject({ ok: false });
  });

  it("refuses a name used by a built-in or another custom role", async () => {
    expect(await createCustomRoleAction({ ...input, name: "finance" })).toMatchObject({ ok: false });
    vi.mocked(db.adminCustomRole.findMany).mockResolvedValue([{ key: "custom:x", name: "FLAG OPS" }] as never);
    expect(await createCustomRoleAction(input)).toMatchObject({ ok: false });
  });

  it("update records before and after", async () => {
    vi.mocked(db.adminCustomRole.findUnique).mockResolvedValue({ id: "r1", key: "custom:abc", name: "Flag ops", permissions: JSON.stringify(["flags.view"]) } as never);
    const r = await updateCustomRoleAction("r1", input);
    expect(r).toMatchObject({ ok: true });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.role_updated", metadata: expect.objectContaining({ before: ["flags.view"], after: ["flags.view", "flags.manage"] }) }));
  });

  it("delete revokes active assignments and audits the count", async () => {
    vi.mocked(db.adminCustomRole.findUnique).mockResolvedValue({ id: "r1", key: "custom:abc", name: "Flag ops", permissions: "[]" } as never);
    const r = await deleteCustomRoleAction("r1", REASON);
    expect(r).toMatchObject({ ok: true });
    expect(vi.mocked(db.adminRoleAssignment.updateMany).mock.calls[0][0].where).toMatchObject({ roleKey: "custom:abc", revokedAt: null });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.role_deleted", metadata: expect.objectContaining({ assignmentsRevoked: 2 }) }));
  });
});

describe("assignAdminRoleAction", () => {
  const input = { email: "Sam@Co.com", roleKey: "finance", expiresInDays: 30, reason: REASON };

  it("promotes an ordinary account to role-based staff, with an expiry, audit and notification", async () => {
    const r = await assignAdminRoleAction(input);
    expect(r).toMatchObject({ ok: true });
    expect(db.user.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { email: "sam@co.com" } }));
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { isPlatformAdmin: true, platformRole: "scoped" } });
    const created = vi.mocked(db.adminRoleAssignment.create).mock.calls[0][0].data;
    expect(created).toMatchObject({ userId: "u2", roleKey: "finance", grantedById: "admin1", reason: REASON });
    expect((created.expiresAt as Date).getTime()).toBeGreaterThan(Date.now() + 29 * 86_400_000);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.role_assigned", targetId: "u2" }));
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: "u2" }));
  });

  it("does not touch the account tier when they are already staff", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...target, isPlatformAdmin: true, platformRole: "scoped" } as never);
    await assignAdminRoleAction(input);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("moves a legacy support admin to role-based access and keeps their support role", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...target, isPlatformAdmin: true, platformRole: "support" } as never);
    await assignAdminRoleAction(input);
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { isPlatformAdmin: true, platformRole: "scoped" } });
    expect(vi.mocked(db.adminRoleAssignment.create).mock.calls.map((c) => c[0].data.roleKey)).toEqual(["support", "finance"]);
  });

  it("refuses yourself, full administrators, unknown accounts, suspended and unverified accounts", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...target, id: "admin1" } as never);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...target, isPlatformAdmin: true, platformRole: null } as never);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
    vi.mocked(db.user.findUnique).mockResolvedValue(null as never);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...target, suspendedAt: new Date() } as never);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
    vi.mocked(db.user.findUnique).mockResolvedValue({ ...target, emailVerified: null } as never);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
    expect(db.adminRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("validates the email, expiry range, reason and role", async () => {
    expect(await assignAdminRoleAction({ ...input, email: "nope" })).toMatchObject({ ok: false });
    expect(await assignAdminRoleAction({ ...input, expiresInDays: 400 })).toMatchObject({ ok: false });
    expect(await assignAdminRoleAction({ ...input, expiresInDays: 0 })).toMatchObject({ ok: false });
    expect(await assignAdminRoleAction({ ...input, reason: "" })).toMatchObject({ ok: false });
    expect(await assignAdminRoleAction({ ...input, roleKey: "superuser" })).toMatchObject({ ok: false });
    expect(await assignAdminRoleAction({ ...input, roleKey: "custom:missing" })).toMatchObject({ ok: false });
    expect(db.adminRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("refuses a duplicate active assignment", async () => {
    vi.mocked(db.adminRoleAssignment.findFirst).mockResolvedValue({ id: "a1" } as never);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
    expect(db.adminRoleAssignment.create).not.toHaveBeenCalled();
  });

  it("refuses to hand out a role holding permissions the actor lacks", async () => {
    m.perms = new Set(["billing.view"]);
    expect(await assignAdminRoleAction(input)).toMatchObject({ ok: false });
  });
});

describe("revokeAdminRoleAction", () => {
  const assignment = { id: "a1", userId: "u2", roleKey: "finance", revokedAt: null, user: { id: "u2", email: "sam@co.com", platformRole: "scoped" } };

  it("revokes, audits, and returns a role-only staff member with no roles left to an ordinary account", async () => {
    vi.mocked(db.adminRoleAssignment.findUnique).mockResolvedValue(assignment as never);
    vi.mocked(db.adminRoleAssignment.count).mockResolvedValue(0 as never);
    const r = await revokeAdminRoleAction("a1", REASON);
    expect(r).toMatchObject({ ok: true });
    expect(db.adminRoleAssignment.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: expect.objectContaining({ revokedById: "admin1" }) });
    expect(db.user.update).toHaveBeenCalledWith({ where: { id: "u2" }, data: { isPlatformAdmin: false, platformRole: null } });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.role_revoked", metadata: expect.objectContaining({ demoted: true }) }));
  });

  it("keeps their staff status while other roles remain", async () => {
    vi.mocked(db.adminRoleAssignment.findUnique).mockResolvedValue(assignment as never);
    vi.mocked(db.adminRoleAssignment.count).mockResolvedValue(1 as never);
    await revokeAdminRoleAction("a1", REASON);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("never demotes the legacy support tier", async () => {
    vi.mocked(db.adminRoleAssignment.findUnique).mockResolvedValue({ ...assignment, user: { ...assignment.user, platformRole: "support" } } as never);
    await revokeAdminRoleAction("a1", REASON);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("needs a reason and an active assignment", async () => {
    expect(await revokeAdminRoleAction("a1", "x")).toMatchObject({ ok: false });
    vi.mocked(db.adminRoleAssignment.findUnique).mockResolvedValue({ ...assignment, revokedAt: new Date() } as never);
    expect(await revokeAdminRoleAction("a1", REASON)).toMatchObject({ ok: false });
    expect(db.adminRoleAssignment.update).not.toHaveBeenCalled();
  });
});
