import { describe, it, expect, vi, beforeEach } from "vitest";
import { impersonateUserAction, stopImpersonatingAction, endSupportSessionsAction } from "./impersonation";
import { db } from "@/lib/db";
import { getRealAdminUser } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { verifyImpersonationToken, IMPERSONATION_TTL_SECONDS } from "@/lib/impersonation";

const jar = { set: vi.fn(), delete: vi.fn(), get: vi.fn() };

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => jar) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ getRealAdminUser: vi.fn() }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: vi.fn() },
    impersonationSession: { updateMany: vi.fn(), create: vi.fn() },
  },
}));

const superAdmin = { id: "admin1", platformRole: null };
const customer = { id: "cust1", email: "c@x.test", name: "Cust", isPlatformAdmin: false, suspendedAt: null, deletedAt: null };

beforeEach(() => {
  jar.set.mockReset();
  jar.delete.mockReset();
  jar.get.mockReset();
  vi.mocked(getRealAdminUser).mockReset().mockResolvedValue(superAdmin as never);
  vi.mocked(logAudit).mockReset();
  vi.mocked(db.user.findUnique).mockReset().mockResolvedValue(customer as never);
  vi.mocked(db.impersonationSession.updateMany).mockReset().mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.impersonationSession.create).mockReset().mockResolvedValue({ id: "sess1" } as never);
});

describe("impersonateUserAction", () => {
  it("starts a read-only session by default, stored server-side, with a token that names the session", async () => {
    const res = await impersonateUserAction("cust1");
    expect(res).toMatchObject({ ok: true });
    expect(vi.mocked(db.impersonationSession.create).mock.calls[0][0].data).toMatchObject({ adminId: "admin1", targetUserId: "cust1", mode: "view", reason: null });
    const [, token, cookieOpts] = jar.set.mock.calls[0];
    expect(verifyImpersonationToken(token)).toMatchObject({ sid: "sess1", adminId: "admin1", targetUserId: "cust1" });
    expect(cookieOpts).toMatchObject({ httpOnly: true, sameSite: "lax", maxAge: IMPERSONATION_TTL_SECONDS.view });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ action: "admin.impersonate_start", metadata: { mode: "view", sessionId: "sess1" } });
  });

  it("an edit session needs a written reason, is shorter, and records the reason", async () => {
    expect(await impersonateUserAction("cust1", { mode: "edit" })).toMatchObject({ ok: false });
    expect(await impersonateUserAction("cust1", { mode: "edit", reason: "too short" })).toMatchObject({ ok: false });
    expect(db.impersonationSession.create).not.toHaveBeenCalled();

    const res = await impersonateUserAction("cust1", { mode: "edit", reason: "Customer asked us to fix their queue" });
    expect(res).toMatchObject({ ok: true });
    expect(vi.mocked(db.impersonationSession.create).mock.calls[0][0].data).toMatchObject({ mode: "edit", reason: "Customer asked us to fix their queue" });
    expect(jar.set.mock.calls[0][2]).toMatchObject({ maxAge: IMPERSONATION_TTL_SECONDS.edit });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ reason: "Customer asked us to fix their queue" });
  });

  it("an unknown mode never becomes an edit session", async () => {
    await impersonateUserAction("cust1", { mode: "root" as never, reason: "x".repeat(20) });
    expect(vi.mocked(db.impersonationSession.create).mock.calls[0][0].data).toMatchObject({ mode: "view" });
  });

  it("ends the administrator's previous session when starting another", async () => {
    await impersonateUserAction("cust1");
    expect(db.impersonationSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ adminId: "admin1", revokedAt: null }) }));
  });

  it.each([
    ["a restricted-tier admin", () => vi.mocked(getRealAdminUser).mockResolvedValue({ id: "a", platformRole: "support" } as never)],
    ["someone who is not an admin", () => vi.mocked(getRealAdminUser).mockResolvedValue(null)],
  ])("refuses %s, creating nothing", async (_n, arrange) => {
    arrange();
    expect(await impersonateUserAction("cust1")).toMatchObject({ ok: false });
    expect(db.impersonationSession.create).not.toHaveBeenCalled();
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("refuses another admin, a suspended account and oneself", async () => {
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ ...customer, isPlatformAdmin: true } as never);
    expect(await impersonateUserAction("other-admin")).toMatchObject({ ok: false });
    vi.mocked(db.user.findUnique).mockResolvedValueOnce({ ...customer, suspendedAt: new Date() } as never);
    expect(await impersonateUserAction("cust1")).toMatchObject({ ok: false });
    expect(await impersonateUserAction("admin1")).toMatchObject({ ok: false });
    expect(db.impersonationSession.create).not.toHaveBeenCalled();
  });
});

describe("stopImpersonatingAction", () => {
  it("ends the session on the server and removes the cookie", async () => {
    const { signImpersonationToken } = await import("@/lib/impersonation");
    jar.get.mockReturnValue({ value: signImpersonationToken("sess1", "admin1", "cust1") });
    const res = await stopImpersonatingAction();
    expect(res).toMatchObject({ ok: true });
    expect(jar.delete).toHaveBeenCalledWith("mps_impersonate");
    expect(db.impersonationSession.updateMany).toHaveBeenCalledWith({
      where: { id: "sess1", adminId: "admin1", revokedAt: null },
      data: expect.objectContaining({ revokedById: "admin1" }),
    });
  });

  it("does not end someone else's session with a token that names it", async () => {
    const { signImpersonationToken } = await import("@/lib/impersonation");
    jar.get.mockReturnValue({ value: signImpersonationToken("sess9", "other-admin", "cust1") });
    await stopImpersonatingAction();
    expect(db.impersonationSession.updateMany).not.toHaveBeenCalled();
  });

  it("still clears the cookie when there is no token", async () => {
    jar.get.mockReturnValue(undefined);
    await stopImpersonatingAction();
    expect(jar.delete).toHaveBeenCalled();
  });
});

describe("endSupportSessionsAction", () => {
  it("ends every live session on the account and says how many", async () => {
    vi.mocked(db.impersonationSession.updateMany).mockResolvedValue({ count: 2 } as never);
    const res = await endSupportSessionsAction("cust1");
    expect(res).toMatchObject({ ok: true, message: "Ended 2 support sessions." });
    expect(vi.mocked(db.impersonationSession.updateMany).mock.calls[0][0].where).toMatchObject({ targetUserId: "cust1", revokedAt: null });
    expect(vi.mocked(logAudit).mock.calls[0][0]).toMatchObject({ action: "admin.impersonate_revoked", metadata: { sessionsEnded: 2 } });
  });

  it("is for unrestricted administrators only", async () => {
    vi.mocked(getRealAdminUser).mockResolvedValue({ id: "a", platformRole: "support" } as never);
    expect(await endSupportSessionsAction("cust1")).toMatchObject({ ok: false });
    expect(db.impersonationSession.updateMany).not.toHaveBeenCalled();
  });
});
