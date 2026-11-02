import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usesInstagramLogin, metaGraphBase, FACEBOOK_GRAPH, INSTAGRAM_LOGIN_GRAPH } from "./meta-host";

let igOn = true;

vi.mock("@/lib/env", () => ({
  env: {
    OAUTH_META_CLIENT_ID: "meta-id",
    OAUTH_META_CLIENT_SECRET: "meta-secret",
    OAUTH_INSTAGRAM_CLIENT_ID: "ig-id",
    OAUTH_INSTAGRAM_CLIENT_SECRET: "ig-secret",
  },
  get instagramLogin() {
    return igOn;
  },
  oauthRedirectUri: (p: string) => `https://app.example.com/api/oauth/${p}/callback`,
  requireAuthSecret: () => "test-secret",
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/entitlements", () => ({ planLimit: vi.fn() }));
vi.mock("@/lib/notifications/account-notify", () => ({ notifyAccountExpired: vi.fn() }));

import { getProvider } from "./providers";
import { startAuthorization } from "./oauth";

const fetchMock = vi.fn();
beforeEach(() => {
  igOn = true;
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });

describe("which host an account talks to", () => {
  it("only an Instagram account flagged igLogin uses graph.instagram.com", () => {
    expect(usesInstagramLogin("instagram", JSON.stringify({ remoteId: "1", igLogin: true }))).toBe(true);
    expect(metaGraphBase("instagram", JSON.stringify({ igLogin: true }))).toBe(INSTAGRAM_LOGIN_GRAPH);
  });

  it("Facebook-connected accounts, other platforms and unreadable metadata stay on graph.facebook.com", () => {
    expect(metaGraphBase("instagram", JSON.stringify({ remoteId: "1", pageId: "p" }))).toBe(FACEBOOK_GRAPH);
    expect(metaGraphBase("instagram", null)).toBe(FACEBOOK_GRAPH);
    expect(metaGraphBase("instagram", "not json")).toBe(FACEBOOK_GRAPH);
    expect(metaGraphBase("facebook", JSON.stringify({ igLogin: true }))).toBe(FACEBOOK_GRAPH);
  });
});

describe("the Instagram provider with Instagram Login configured", () => {
  it("authorizes on instagram.com with the Instagram app, not the Facebook one", () => {
    const p = getProvider("instagram")!;
    expect(p.authorizeUrl).toBe("https://www.instagram.com/oauth/authorize");
    expect(p.tokenUrl).toBe("https://api.instagram.com/oauth/access_token");
    expect(p.clientId()).toBe("ig-id");
    expect(p.clientSecret()).toBe("ig-secret");
    expect(p.scopes).toEqual([
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_comments",
      "instagram_business_manage_insights",
    ]);
  });

  it("the redirect the person is sent to names Instagram, our callback, comma-separated scopes and a fresh sign-in", () => {
    const { redirectUrl } = startAuthorization("instagram", "ws1", "u1");
    const u = new URL(redirectUrl);
    expect(u.origin + u.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(u.searchParams.get("client_id")).toBe("ig-id");
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.example.com/api/oauth/instagram/callback");
    expect(u.searchParams.get("scope")).toBe(
      "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments,instagram_business_manage_insights",
    );
    expect(u.searchParams.get("force_reauth")).toBe("true");
    expect(redirectUrl).not.toMatch(/facebook\.com/);
  });

  it("finalize trades the short token for a long one, reads the account and flags it igLogin", async () => {
    fetchMock
      .mockResolvedValueOnce(ok({ access_token: "LONG", token_type: "bearer", expires_in: 5_184_000 }))
      .mockResolvedValueOnce(ok({ user_id: "1784", username: "shop", name: "The Shop", profile_picture_url: "https://x/y.jpg", account_type: "BUSINESS" }));
    const fin = await getProvider("instagram")!.finalize!("SHORT");

    const [exchange, me] = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(exchange).toContain("https://graph.instagram.com/access_token?grant_type=ig_exchange_token");
    expect(exchange).toContain("client_secret=ig-secret");
    expect(exchange).toContain("access_token=SHORT");
    expect(me).toContain("https://graph.instagram.com/v21.0/me?fields=user_id,username");
    expect(me).toContain("access_token=LONG");

    expect(fin).toMatchObject({
      accessToken: "LONG",
      metadata: { remoteId: "1784", igLogin: true },
      handle: "@shop",
      displayName: "The Shop",
      avatarUrl: "https://x/y.jpg",
    });
    expect(fin.expiresAt!.getTime()).toBeGreaterThan(Date.now() + 59 * 86_400_000);
  });

  it("falls back to the username when the account has no display name, and refuses an empty answer", async () => {
    fetchMock.mockResolvedValueOnce(ok({ access_token: "LONG", expires_in: 100 })).mockResolvedValueOnce(ok({ id: "55", username: "solo" }));
    expect(await getProvider("instagram")!.finalize!("S")).toMatchObject({ displayName: "solo", metadata: { remoteId: "55" } });

    fetchMock.mockReset().mockResolvedValueOnce(ok({ access_token: "LONG" })).mockResolvedValueOnce(ok({}));
    await expect(getProvider("instagram")!.finalize!("S")).rejects.toThrow(/did not return an account/);
  });

  it("a rejected token swap surfaces as an error instead of storing the short-lived token", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 400, text: async () => "bad code", json: async () => ({}) });
    await expect(getProvider("instagram")!.finalize!("S")).rejects.toThrow(/400/);
  });
});

describe("without Instagram Login credentials", () => {
  it("Instagram still connects through Facebook exactly as before", () => {
    igOn = false;
    const p = getProvider("instagram")!;
    expect(p.authorizeUrl).toBe("https://www.facebook.com/v21.0/dialog/oauth");
    expect(p.clientId()).toBe("meta-id");
    expect(p.scopes).toContain("instagram_content_publish");
    expect(p.scopes).toContain("pages_show_list");
  });
});
