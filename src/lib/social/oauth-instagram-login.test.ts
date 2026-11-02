import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { completeAuthorization, refreshIfNeeded } from "./oauth";
import { db } from "@/lib/db";
import { getProvider } from "./providers";
import { planLimit } from "@/lib/entitlements";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/notifications/account-notify", () => ({ notifyAccountExpired: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ planLimit: vi.fn() }));
vi.mock("./crypto", () => ({
  encryptToken: (t: string) => `enc:${t}`,
  decryptToken: (t: string) => {
    if (!t.startsWith("enc:")) throw new Error("bad blob");
    return t.slice(4);
  },
}));
vi.mock("./providers", () => ({ getProvider: vi.fn(), oauthRedirectUri: vi.fn(() => "https://app.example.com/api/oauth/instagram/callback") }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findUnique: vi.fn() },
    membership: { findUnique: vi.fn() },
    socialAccount: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    socialChannel: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
  },
}));

const fetchMock = vi.fn();
const DAY = 86_400_000;

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(db.socialAccount.update).mockReset().mockResolvedValue({ id: "acc1" } as never);
  vi.mocked(db.socialAccount.updateMany).mockReset().mockResolvedValue({ count: 1 } as never);
});
afterEach(() => vi.unstubAllGlobals());

describe("completeAuthorization with Instagram Login", () => {
  it("sends the code without Instagram's trailing #_ and stores the long-lived login flagged igLogin", async () => {
    vi.mocked(db.workspace.findUnique).mockResolvedValue({ orgId: "org1", members: [] } as never);
    vi.mocked(db.membership.findUnique).mockResolvedValue({ role: "owner", status: "active", customRole: null } as never);
    vi.mocked(planLimit).mockResolvedValue(0);
    vi.mocked(db.socialAccount.findFirst).mockResolvedValue(null);
    vi.mocked(db.socialAccount.create).mockResolvedValue({ id: "acc1" } as never);
    vi.mocked(db.socialChannel.count).mockResolvedValue(0);
    vi.mocked(db.socialChannel.findFirst).mockResolvedValue(null);
    vi.mocked(db.socialChannel.create).mockResolvedValue({} as never);
    vi.mocked(getProvider).mockReturnValue({
      key: "instagram",
      tokenUrl: "https://api.instagram.com/oauth/access_token",
      scopes: [],
      usePKCE: false,
      clientId: () => "ig-id",
      clientSecret: () => "ig-secret",
      identify: async () => {
        throw new Error("identify must not run when finalize resolved the handle");
      },
      finalize: async () => ({
        accessToken: "LONG",
        metadata: { remoteId: "1784", igLogin: true },
        expiresAt: new Date(Date.now() + 60 * DAY),
        handle: "@shop",
        displayName: "The Shop",
      }),
    } as never);
    // Instagram answers with the short-lived token plus a user_id; only the token is used.
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: "SHORT", user_id: 1784, permissions: ["instagram_business_basic"] }), text: async () => "" });

    await completeAuthorization({ platform: "instagram", workspaceId: "ws1", userId: "u1", nonce: "n", exp: Date.now() + 60_000 }, "AQDabc#_");

    const form = fetchMock.mock.calls[0][1].body as URLSearchParams;
    expect(form.get("code")).toBe("AQDabc");
    expect(form.get("client_id")).toBe("ig-id");
    expect(form.get("client_secret")).toBe("ig-secret");
    const saved = vi.mocked(db.socialAccount.create).mock.calls[0][0].data as { accessToken: string; metadata: string; handle: string };
    expect(saved.handle).toBe("@shop");
    expect(JSON.parse(saved.metadata)).toMatchObject({ remoteId: "1784", igLogin: true });
    expect(saved.accessToken).toBe("enc:LONG");
  });
});

describe("refreshIfNeeded for Instagram Login tokens", () => {
  const account = (over: Record<string, unknown> = {}) => ({
    id: "acc1",
    platform: "instagram",
    accessToken: "enc:OLD",
    refreshToken: null,
    tokenExpiresAt: new Date(Date.now() + 3 * DAY),
    metadata: JSON.stringify({ remoteId: "1784", igLogin: true }),
    ...over,
  });

  it("leaves a token with more than a week left alone", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account({ tokenExpiresAt: new Date(Date.now() + 30 * DAY) }) as never);
    expect(await refreshIfNeeded("acc1")).toBe("OLD");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rotates a token inside its last week through graph.instagram.com and stores the new one", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account() as never);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ access_token: "NEW", expires_in: 5_184_000 }), text: async () => "" });
    expect(await refreshIfNeeded("acc1")).toBe("NEW");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token");
    expect(url).toContain("access_token=OLD");
    const data = vi.mocked(db.socialAccount.update).mock.calls[0][0].data as { accessToken: string; status: string };
    expect(data).toMatchObject({ accessToken: "enc:NEW", status: "connected" });
  });

  it("a network or server hiccup keeps the current token and does not expire the account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account() as never);
    fetchMock.mockResolvedValue({ ok: false, status: 503, text: async () => "unavailable" });
    expect(await refreshIfNeeded("acc1")).toBe("OLD");
    expect(db.socialAccount.updateMany).not.toHaveBeenCalled();
  });

  it("a rejected token marks the account expired so the person is asked to reconnect", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(account() as never);
    fetchMock.mockResolvedValue({ ok: false, status: 400, text: async () => "invalid_token" });
    expect(await refreshIfNeeded("acc1")).toBeNull();
    expect(vi.mocked(db.socialAccount.updateMany)).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "expired" } }));
  });

  it("a Facebook-connected Instagram account is not rotated (its Page token does not expire)", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(
      account({ metadata: JSON.stringify({ remoteId: "1784", pageId: "p" }), tokenExpiresAt: null }) as never,
    );
    expect(await refreshIfNeeded("acc1")).toBe("OLD");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
