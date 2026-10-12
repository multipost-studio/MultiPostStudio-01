import { describe, it, expect, vi, beforeEach } from "vitest";
import { setWorkspaceRestrictedAction, addWorkspaceMemberAction, removeWorkspaceMemberAction } from "./team";
import { db } from "@/lib/db";
import { withPermission } from "./_helpers";
import { logAudit } from "@/lib/events";

vi.mock("./_helpers", () => ({
  withPermission: vi.fn(),
  entitlementGuard: vi.fn(),
  limitGuard: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn(), notify: vi.fn() }));
vi.mock("@/lib/adapters/email", () => ({ sendInviteEmail: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(), debumpUsage: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findMany: vi.fn(), update: vi.fn() },
    workspaceMember: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    membership: { findMany: vi.fn(), findUnique: vi.fn() },
  },
}));

const ctx = (orgRole = "owner", restricted = false) => ({
  active: { org: { id: "org1" }, workspace: { id: "wsA", restricted }, orgRole, role: orgRole },
  user: { id: "me" },
});

function org(opts: { workspaces: { id: string; restricted: boolean }[]; rows?: { workspaceId: string; userId: string }[]; members: { userId: string; role: string }[] }) {
  vi.mocked(db.workspace.findMany).mockResolvedValue(opts.workspaces as never);
  vi.mocked(db.workspaceMember.findMany).mockResolvedValue((opts.rows ?? []) as never);
  vi.mocked(db.membership.findMany).mockResolvedValue(opts.members as never);
}

beforeEach(() => {
  vi.mocked(withPermission).mockReset().mockResolvedValue(ctx() as never);
  vi.mocked(logAudit).mockReset();
  vi.mocked(db.workspace.findMany).mockReset();
  vi.mocked(db.workspace.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.workspaceMember.upsert).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.workspaceMember.deleteMany).mockReset().mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.membership.findUnique).mockReset();
});

describe("setWorkspaceRestrictedAction", () => {
  it("only owners and admins may change it, even with members.manage", async () => {
    vi.mocked(withPermission).mockResolvedValue(ctx("manager") as never);
    const res = await setWorkspaceRestrictedAction(true);
    expect(res.ok).toBe(false);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("restricts when everyone keeps some workspace", async () => {
    org({ workspaces: [{ id: "wsA", restricted: false }, { id: "wsB", restricted: false }], members: [{ userId: "ana", role: "editor" }] });
    const res = await setWorkspaceRestrictedAction(true);
    expect(res.ok).toBe(true);
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "wsA" }, data: { restricted: true } });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ action: "workspace.restricted", targetId: "wsA" });
  });

  it("refuses when it would leave someone with no workspace to open, and changes nothing", async () => {
    org({ workspaces: [{ id: "wsA", restricted: false }], members: [{ userId: "ana", role: "editor" }, { userId: "bo", role: "viewer" }] });
    const res = await setWorkspaceRestrictedAction(true);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/2 people would have no workspace left/);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });

  it("people already added to the workspace keep it", async () => {
    org({ workspaces: [{ id: "wsA", restricted: false }], rows: [{ workspaceId: "wsA", userId: "ana" }], members: [{ userId: "ana", role: "editor" }] });
    expect((await setWorkspaceRestrictedAction(true)).ok).toBe(true);
  });

  it("opening it again needs no check and is always allowed", async () => {
    vi.mocked(withPermission).mockResolvedValue(ctx("owner", true) as never);
    const res = await setWorkspaceRestrictedAction(false);
    expect(res.ok).toBe(true);
    expect(db.workspace.update).toHaveBeenCalledWith({ where: { id: "wsA" }, data: { restricted: false } });
    expect(db.workspace.findMany).not.toHaveBeenCalled();
  });

  it("is a no-op when it already is in that state", async () => {
    await setWorkspaceRestrictedAction(false);
    expect(db.workspace.update).not.toHaveBeenCalled();
  });
});

describe("addWorkspaceMemberAction", () => {
  it("adds an active org member with a role that mirrors their org role", async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue({ role: "analyst", status: "active" } as never);
    const res = await addWorkspaceMemberAction("ana");
    expect(res.ok).toBe(true);
    expect(vi.mocked(db.workspaceMember.upsert).mock.calls[0][0]).toMatchObject({
      where: { workspaceId_userId: { workspaceId: "wsA", userId: "ana" } },
      create: { workspaceId: "wsA", userId: "ana", role: "analyst" },
      update: {},
    });
  });

  it("refuses someone who is not in this organisation", async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue(null);
    expect((await addWorkspaceMemberAction("stranger")).ok).toBe(false);
    expect(db.workspaceMember.upsert).not.toHaveBeenCalled();
  });

  it("refuses a suspended member", async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue({ role: "editor", status: "suspended" } as never);
    expect((await addWorkspaceMemberAction("ana")).ok).toBe(false);
  });
});

describe("removeWorkspaceMemberAction", () => {
  beforeEach(() => {
    vi.mocked(withPermission).mockResolvedValue(ctx("owner", true) as never);
    vi.mocked(db.membership.findUnique).mockResolvedValue({ role: "editor", status: "active" } as never);
  });

  it("only makes sense on a restricted workspace", async () => {
    vi.mocked(withPermission).mockResolvedValue(ctx("owner", false) as never);
    expect((await removeWorkspaceMemberAction("ana")).ok).toBe(false);
    expect(db.workspaceMember.deleteMany).not.toHaveBeenCalled();
  });

  it("removes access when the person keeps another workspace", async () => {
    org({ workspaces: [{ id: "wsA", restricted: true }, { id: "wsB", restricted: false }], rows: [{ workspaceId: "wsA", userId: "ana" }], members: [{ userId: "ana", role: "editor" }] });
    expect((await removeWorkspaceMemberAction("ana")).ok).toBe(true);
    expect(db.workspaceMember.deleteMany).toHaveBeenCalledWith({ where: { workspaceId: "wsA", userId: "ana" } });
  });

  it("will not strand someone: their only workspace stays", async () => {
    org({ workspaces: [{ id: "wsA", restricted: true }], rows: [{ workspaceId: "wsA", userId: "ana" }], members: [{ userId: "ana", role: "editor" }] });
    const res = await removeWorkspaceMemberAction("ana");
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/only workspace/);
    expect(db.workspaceMember.deleteMany).not.toHaveBeenCalled();
  });

  it("never removes owners or admins, or the caller", async () => {
    vi.mocked(db.membership.findUnique).mockResolvedValue({ role: "admin", status: "active" } as never);
    expect((await removeWorkspaceMemberAction("boss")).ok).toBe(false);
    expect((await removeWorkspaceMemberAction("me")).ok).toBe(false);
    expect(db.workspaceMember.deleteMany).not.toHaveBeenCalled();
  });

  it("a manager cannot take access from a peer", async () => {
    vi.mocked(withPermission).mockResolvedValue(ctx("manager", true) as never);
    vi.mocked(db.membership.findUnique).mockResolvedValue({ role: "manager", status: "active" } as never);
    expect((await removeWorkspaceMemberAction("peer")).ok).toBe(false);
  });
});
