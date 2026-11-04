import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ rateOk: true, clients: 0, created: [] as Record<string, unknown>[], token: vi.fn(), revoke: vi.fn(async () => undefined), start: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ appUrl: (p = "") => `https://app.example.com${p}` }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: async () => "1.2.3.4",
  rateLimit: vi.fn(async () => ({ ok: m.rateOk, remaining: 1, resetAt: Date.now() + 1000 })),
}));
vi.mock("@/lib/db", () => ({
  db: {
    oAuthClient: {
      count: vi.fn(async () => m.clients),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        m.created.push(data);
        return { ...data, createdAt: new Date("2026-11-02T00:00:00Z") };
      }),
    },
  },
}));
vi.mock("@/lib/mcp/token-service", () => ({ handleTokenRequest: m.token, revokeToken: m.revoke }));
vi.mock("@/lib/mcp/authorize-service", () => ({ startAuthorization: m.start }));

import { POST as register } from "./register/route";
import { POST as token } from "./token/route";
import { POST as revoke } from "./revoke/route";
import { GET as authorize } from "./authorize/route";
import { GET as protectedResource } from "../../.well-known/oauth-protected-resource/[[...path]]/route";
import { GET as authServer } from "../../.well-known/oauth-authorization-server/[[...path]]/route";

const post = (url: string, body: string, type = "application/json") => new NextRequest(url, { method: "POST", headers: { "content-type": type }, body });

beforeEach(() => {
  vi.clearAllMocks();
  m.rateOk = true;
  m.clients = 0;
  m.created = [];
});

describe("client registration", () => {
  it("registers a public client and answers with its id", async () => {
    const res = await register(post("https://app.example.com/api/mcp-oauth/register", JSON.stringify({ redirect_uris: ["https://claude.ai/cb"], client_name: "Claude" })));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ client_name: "Claude", redirect_uris: ["https://claude.ai/cb"], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
    expect(body.client_id).toMatch(/^mpc_/);
    expect(m.created[0]).toMatchObject({ name: "Claude", redirectUris: JSON.stringify(["https://claude.ai/cb"]) });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("refuses bad metadata, bad JSON, floods and a day that is full", async () => {
    expect((await register(post("http://x/register", JSON.stringify({ redirect_uris: ["http://evil.example/cb"] })))).status).toBe(400);
    expect((await register(post("http://x/register", "{nope"))).status).toBe(400);
    m.clients = 2_000;
    expect((await register(post("http://x/register", JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] })))).status).toBe(503);
    m.rateOk = false;
    expect((await register(post("http://x/register", JSON.stringify({ redirect_uris: ["https://claude.ai/cb"] })))).status).toBe(429);
    expect(m.created).toHaveLength(0);
  });
});

describe("token endpoint", () => {
  it("reads a form body, passes it on, and never lets the answer be cached", async () => {
    m.token.mockResolvedValue({ status: 200, body: { access_token: "a" } });
    const res = await token(post("http://x/token", "grant_type=authorization_code&client_id=mpc_a&code=c", "application/x-www-form-urlencoded"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const params = m.token.mock.calls[0][0] as URLSearchParams;
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("c");
  });

  it("also takes JSON, rejects a broken body, rate limits and survives a failure", async () => {
    m.token.mockResolvedValue({ status: 200, body: {} });
    await token(post("http://x/token", JSON.stringify({ grant_type: "refresh_token", client_id: "mpc_a", refresh_token: "r", ignored: 5 })));
    expect((m.token.mock.calls[0][0] as URLSearchParams).get("refresh_token")).toBe("r");
    expect((m.token.mock.calls[0][0] as URLSearchParams).has("ignored")).toBe(false);
    expect((await token(post("http://x/token", "{bad"))).status).toBe(400);
    m.token.mockRejectedValue(new Error("db down"));
    const failed = await token(post("http://x/token", "grant_type=x&client_id=y", "application/x-www-form-urlencoded"));
    expect(failed.status).toBe(500);
    expect(JSON.stringify(await failed.json())).not.toContain("db down");
    m.rateOk = false;
    expect((await token(post("http://x/token", "a=b", "application/x-www-form-urlencoded"))).status).toBe(429);
  });
});

describe("revocation and authorize", () => {
  it("always answers 200 on revoke, and revokes what it is given", async () => {
    expect((await revoke(post("http://x/revoke", "token=abc", "application/x-www-form-urlencoded"))).status).toBe(200);
    expect(m.revoke).toHaveBeenCalledWith("abc");
    expect((await revoke(post("http://x/revoke", "", "application/x-www-form-urlencoded"))).status).toBe(200);
  });

  it("redirects to the consent screen, or shows a plain error page without redirecting", async () => {
    m.start.mockResolvedValue({ kind: "redirect", location: "https://app.example.com/connect/authorize?request=mpq_1" });
    const ok = await authorize(new NextRequest("https://app.example.com/api/mcp-oauth/authorize?client_id=x"));
    expect(ok.status).toBe(302);
    expect(ok.headers.get("Location")).toBe("https://app.example.com/connect/authorize?request=mpq_1");
    m.start.mockResolvedValue({ kind: "page-error", message: "bad <script>" });
    const bad = await authorize(new NextRequest("https://app.example.com/api/mcp-oauth/authorize"));
    expect(bad.status).toBe(400);
    expect(bad.headers.get("Location")).toBeNull();
    expect(await bad.text()).not.toContain("<script>");
  });
});

describe("discovery documents", () => {
  it("point the assistant at this server's own endpoints", async () => {
    const resource = await (await protectedResource()).json();
    expect(resource).toMatchObject({ resource: "https://app.example.com/api/mcp", authorization_servers: ["https://app.example.com"], bearer_methods_supported: ["header"] });
    expect(resource.scopes_supported).toContain("posts:read");
    expect(resource.scopes_supported).not.toContain("webhooks:manage");

    const server = await (await authServer()).json();
    expect(server).toMatchObject({
      issuer: "https://app.example.com",
      authorization_endpoint: "https://app.example.com/api/mcp-oauth/authorize",
      token_endpoint: "https://app.example.com/api/mcp-oauth/token",
      registration_endpoint: "https://app.example.com/api/mcp-oauth/register",
      revocation_endpoint: "https://app.example.com/api/mcp-oauth/revoke",
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });
});
