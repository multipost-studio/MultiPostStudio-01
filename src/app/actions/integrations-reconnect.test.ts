import { describe, it, expect, vi, beforeEach } from "vitest";
import { reconnectAccountAction } from "./integrations";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/social/providers";

let production = true;

vi.mock("@/lib/env", async (orig) => ({
  ...(await orig<typeof import("@/lib/env")>()),
  get isProduction() {
    return production;
  },
}));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn(async () => ({ active: { workspace: { id: "ws1" }, org: { id: "org1" } }, user: { id: "u1", isImpersonated: false } })),
  entitlementGuard: vi.fn(),
  limitGuard: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("@/lib/social/providers", () => ({ getProvider: vi.fn(), oauthRedirectUri: vi.fn() }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), logAudit: vi.fn(), notify: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { socialAccount: { findUnique: vi.fn(), update: vi.fn() } } }));

const account = (platform: string) => ({ id: "acc1", workspaceId: "ws1", platform });

beforeEach(() => {
  production = true;
  vi.mocked(db.socialAccount.findUnique).mockReset();
  vi.mocked(db.socialAccount.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(getProvider).mockReset().mockReturnValue(null);
});

describe("reconnectAccountAction", () => {
  it("sends a platform account to the real sign-in and leaves its status alone", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account("instagram") as never);
    vi.mocked(getProvider).mockReturnValue({ key: "instagram" } as never);
    const res = await reconnectAccountAction("acc1");
    // A Facebook-connected Instagram account reconnects through Facebook, which keeps music and location available.
    expect(res).toMatchObject({ ok: true, data: { redirectTo: "/api/oauth/instagram/start?via=facebook" } });
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });

  it("an Instagram-Login account reconnects through Instagram", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ ...account("instagram"), metadata: JSON.stringify({ igLogin: true }) } as never);
    vi.mocked(getProvider).mockReturnValue({ key: "instagram" } as never);
    expect(await reconnectAccountAction("acc1")).toMatchObject({ data: { redirectTo: "/api/oauth/instagram/start?via=instagram" } });
  });

  it("falls back to the default sign-in when the way the account was connected is no longer configured", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account("instagram") as never);
    vi.mocked(getProvider).mockImplementation(((_p: string, via?: string) => (via ? null : { key: "instagram" })) as never);
    expect(await reconnectAccountAction("acc1")).toMatchObject({ data: { redirectTo: "/api/oauth/instagram/start" } });
  });

  it("works the same outside production", async () => {
    production = false;
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account("youtube") as never);
    vi.mocked(getProvider).mockReturnValue({ key: "youtube" } as never);
    expect(await reconnectAccountAction("acc1")).toMatchObject({ ok: true, data: { redirectTo: "/api/oauth/youtube/start" } });
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });

  it("never marks a Bluesky account connected without a new login", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account("bluesky") as never);
    const res = await reconnectAccountAction("acc1");
    expect(res.ok).toBe(false);
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });

  it("refuses to flip a placeholder account to connected in production", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account("tiktok") as never);
    const res = await reconnectAccountAction("acc1");
    expect(res.ok).toBe(false);
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });

  it("keeps the old behaviour for a demo placeholder account outside production", async () => {
    production = false;
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account("tiktok") as never);
    expect((await reconnectAccountAction("acc1")).ok).toBe(true);
    expect(db.socialAccount.update).toHaveBeenCalledOnce();
  });

  it("only touches accounts in the caller's workspace", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ ...account("instagram"), workspaceId: "other" } as never);
    const res = await reconnectAccountAction("acc1");
    expect(res.ok).toBe(false);
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });
});
