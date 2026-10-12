import { describe, it, expect, vi, beforeEach } from "vitest";
import { getCurrentUser } from "./session";
import { db } from "@/lib/db";
import { auth } from "@/auth";
import { signImpersonationToken } from "@/lib/impersonation";

let cookieToken: string | undefined;

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: (k: string) => (k === "mps_impersonate" && cookieToken ? { value: cookieToken } : undefined) })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { user: { findUnique: vi.fn() }, impersonationSession: { findUnique: vi.fn() } },
}));

const admin = { id: "admin1", email: "a@x", name: "Admin", isPlatformAdmin: true, platformRole: null, suspendedAt: null, deletedAt: null };
const customer = { id: "cust1", email: "c@x", name: "Cust", isPlatformAdmin: false, platformRole: null, suspendedAt: null, deletedAt: null };
const future = () => new Date(Date.now() + 600_000);

function users() {
  vi.mocked(db.user.findUnique).mockImplementation((async (args: { where: { id: string } }) => (args.where.id === "admin1" ? admin : customer)) as never);
}
function sessionRow(patch: Record<string, unknown> = {}) {
  vi.mocked(db.impersonationSession.findUnique).mockResolvedValue({ adminId: "admin1", targetUserId: "cust1", mode: "view", expiresAt: future(), revokedAt: null, ...patch } as never);
}

beforeEach(() => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "admin1" } } as never);
  vi.mocked(db.impersonationSession.findUnique).mockReset();
  users();
  cookieToken = signImpersonationToken("sess1", "admin1", "cust1");
});

describe("getCurrentUser during a support session", () => {
  it("acts as the customer, read-only, while the session is live", async () => {
    sessionRow();
    const u = (await getCurrentUser())!;
    expect(u.id).toBe("cust1");
    expect(u.isImpersonated).toBe(true);
    expect(u.impersonationMode).toBe("view");
    expect(u.impersonatorAdmin?.id).toBe("admin1");
  });

  it("reports an edit session as edit", async () => {
    sessionRow({ mode: "edit" });
    expect((await getCurrentUser())!.impersonationMode).toBe("edit");
  });

  it.each([
    ["revoked", { revokedAt: new Date() }],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["for a different customer", { targetUserId: "someone-else" }],
    ["owned by a different administrator", { adminId: "admin2" }],
  ])("ends at once when the session row is %s, even though the cookie is intact", async (_n, patch) => {
    sessionRow(patch);
    const u = (await getCurrentUser())!;
    expect(u.id).toBe("admin1");
    expect(u.isImpersonated).toBe(false);
    expect(u.impersonationMode).toBeNull();
  });

  it("ends when the session row no longer exists", async () => {
    vi.mocked(db.impersonationSession.findUnique).mockResolvedValue(null);
    expect((await getCurrentUser())!.isImpersonated).toBe(false);
  });

  it("ends when the administrator was moved to a restricted tier", async () => {
    sessionRow();
    vi.mocked(db.user.findUnique).mockImplementation((async (args: { where: { id: string } }) => (args.where.id === "admin1" ? { ...admin, platformRole: "support" } : customer)) as never);
    expect((await getCurrentUser())!.isImpersonated).toBe(false);
  });

  it("never impersonates another administrator", async () => {
    sessionRow();
    vi.mocked(db.user.findUnique).mockImplementation((async (args: { where: { id: string } }) => (args.where.id === "admin1" ? admin : { ...customer, isPlatformAdmin: true })) as never);
    expect((await getCurrentUser())!.isImpersonated).toBe(false);
  });

  it("a forged or old-format cookie does nothing and costs no session lookup", async () => {
    cookieToken = "garbage.token";
    expect((await getCurrentUser())!.isImpersonated).toBe(false);
    expect(db.impersonationSession.findUnique).not.toHaveBeenCalled();
  });

  it("an ordinary customer is not affected and never touches the sessions table", async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: "cust1" } } as never);
    const u = (await getCurrentUser())!;
    expect(u).toMatchObject({ id: "cust1", isImpersonated: false, impersonationMode: null });
    expect(db.impersonationSession.findUnique).not.toHaveBeenCalled();
  });
});
