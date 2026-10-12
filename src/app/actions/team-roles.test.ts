import { describe, it, expect, vi, beforeEach } from "vitest";
import { inviteMemberAction, updateMemberRoleAction } from "./team";
import { db } from "@/lib/db";
import { withPermission, limitGuard } from "./_helpers";

vi.mock("./_helpers", () => ({
  withPermission: vi.fn(),
  entitlementGuard: vi.fn(),
  limitGuard: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/adapters/email", () => ({ sendInviteEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(), debumpUsage: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hash") } }));

const tx = {
  verificationToken: { create: vi.fn() },
  membership: { create: vi.fn() },
  workspaceMember: { create: vi.fn() },
};
vi.mock("@/lib/db", () => ({
  db: {
    membership: { count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn(), create: vi.fn() },
    workspaceMember: { updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const ctx = (orgRole = "owner") => ({
  active: { org: { id: "org1", name: "Acme" }, workspace: { id: "ws1" }, orgRole, role: orgRole },
  user: { id: "actor", name: "Actor" },
});

function inviteForm(orgRole: string) {
  const fd = new FormData();
  fd.set("email", "new@example.com");
  fd.set("name", "New Person");
  fd.set("orgRole", orgRole);
  return fd;
}

beforeEach(() => {
  vi.mocked(withPermission).mockReset().mockResolvedValue(ctx() as never);
  vi.mocked(limitGuard).mockReset().mockResolvedValue(null);
  vi.mocked(db.membership.count).mockReset().mockResolvedValue(1);
  vi.mocked(db.user.findUnique).mockReset().mockResolvedValue({ id: "invitee" } as never);
  vi.mocked(db.membership.findUnique).mockReset().mockResolvedValue(null);
  vi.mocked(db.membership.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.workspaceMember.updateMany).mockReset().mockResolvedValue({ count: 1 } as never);
  Object.values(tx).forEach((m) => Object.values(m).forEach((f) => f.mockReset().mockResolvedValue({})));
  vi.mocked(db.$transaction).mockReset().mockImplementation(async (fn: unknown) => (fn as (t: typeof tx) => Promise<unknown>)(tx));
});

describe("inviteMemberAction: the workspace row mirrors the invited role", () => {
  it.each([
    ["viewer", "viewer"],
    ["analyst", "analyst"],
    ["creator", "creator"],
    ["editor", "editor"],
    ["manager", "manager"],
    ["admin", "manager"],
  ])("inviting a %s writes a %s workspace row, never a fixed editor", async (invited, expected) => {
    const res = await inviteMemberAction(null, inviteForm(invited));
    expect(res.ok).toBe(true);
    expect(tx.membership.create.mock.calls[0][0].data.role).toBe(invited);
    expect(tx.workspaceMember.create.mock.calls[0][0].data).toMatchObject({ workspaceId: "ws1", userId: "invitee", role: expected });
  });
});

describe("updateMemberRoleAction: the new role reaches the workspace rows", () => {
  beforeEach(() => {
    vi.mocked(db.membership.findUnique).mockResolvedValue({ id: "m1", role: "viewer" } as never);
  });

  it("moves rows that follow the old role, or carry the legacy fixed editor, to the new role", async () => {
    const res = await updateMemberRoleAction("target", "analyst");
    expect(res.ok).toBe(true);
    expect(db.workspaceMember.updateMany).toHaveBeenCalledWith({
      where: { userId: "target", workspace: { orgId: "org1" }, role: { in: ["viewer", "editor"] } },
      data: { role: "analyst" },
    });
  });

  it("never touches a client row or an unrelated deliberate override", async () => {
    await updateMemberRoleAction("target", "creator");
    const where = vi.mocked(db.workspaceMember.updateMany).mock.calls[0][0]!.where as { role: { in: string[] } };
    expect(where.role.in).not.toContain("client");
    expect(where.role.in).not.toContain("manager");
  });

  it("promoting to admin stores the manager equivalent (the effective role stays admin)", async () => {
    await updateMemberRoleAction("target", "admin");
    expect(vi.mocked(db.workspaceMember.updateMany).mock.calls[0][0]!.data).toEqual({ role: "manager" });
  });

  it("changes nothing when the change itself is refused", async () => {
    vi.mocked(withPermission).mockResolvedValue(ctx("manager") as never);
    const res = await updateMemberRoleAction("target", "admin");
    expect(res.ok).toBe(false);
    expect(db.membership.update).not.toHaveBeenCalled();
    expect(db.workspaceMember.updateMany).not.toHaveBeenCalled();
  });
});
