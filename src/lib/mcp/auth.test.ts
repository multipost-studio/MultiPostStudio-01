import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => {
  class ApiAuthError extends Error {
    constructor(
      public status: number,
      message: string,
      public retryAfterSec?: number,
      public rateLimitHeaders?: HeadersInit,
    ) {
      super(message);
    }
  }
  return {
    ApiAuthError,
    authenticateApiKey: vi.fn(),
    token: null as Record<string, unknown> | null,
    members: 1,
    entitled: true,
    perMin: 0,
    rl: { ok: true, remaining: 10, resetAt: Date.now() + 30_000 },
    update: vi.fn(async () => ({})),
  };
});

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/api/auth", () => ({ ApiAuthError: m.ApiAuthError, authenticateApiKey: m.authenticateApiKey }));
vi.mock("@/lib/db", () => ({
  db: { oAuthToken: { findUnique: vi.fn(async () => m.token), update: m.update }, membership: { count: vi.fn(async () => m.members) } },
}));
vi.mock("./grant", () => ({ grantStillAllowed: vi.fn(async () => m.members > 0) }));
vi.mock("@/lib/entitlements", () => ({ hasEntitlement: vi.fn(async () => m.entitled), planLimit: vi.fn(async () => m.perMin) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => m.rl),
  rateLimitHeaders: () => ({ "X-RateLimit-Limit": "120" }),
  retryAfterSec: () => 30,
}));

import { authenticateMcp, McpAuthError } from "./auth";
import { sha256Hex } from "./oauth";

const req = (authorization?: string) => new NextRequest("https://app.example.com/api/mcp", { method: "POST", headers: authorization ? { authorization } : {} });
const future = () => new Date(Date.now() + 3_600_000);
const goodToken = (over: Record<string, unknown> = {}) => ({
  id: "t1",
  orgId: "o1",
  userId: "u1",
  workspaceId: "w1",
  scopes: JSON.stringify(["posts:read"]),
  accessHash: sha256Hex("mpo_good"),
  accessExpiresAt: future(),
  revokedAt: null,
  client: { name: "Claude" },
  org: { deletedAt: null },
  ...over,
});
const fails = async (p: Promise<unknown>) => p.then(() => null, (e) => e as McpAuthError);

beforeEach(() => {
  vi.clearAllMocks();
  m.token = goodToken();
  m.members = 1;
  m.entitled = true;
  m.perMin = 0;
  m.rl = { ok: true, remaining: 10, resetAt: Date.now() + 30_000 };
  m.authenticateApiKey.mockResolvedValue({ keyId: "k1", orgId: "o1", scopes: ["posts:read"], name: "My key" });
});

describe("API keys", () => {
  it("go through the public API's own checks and are not limited to a workspace", async () => {
    const ctx = await authenticateMcp(req("Bearer mps_live_abc"));
    expect(ctx).toMatchObject({ via: "key", workspaceId: null, userId: null, client: "My key", orgId: "o1" });
  });

  it("keep the status the API gives: 401, 403 (plan), 429 (rate limit)", async () => {
    for (const status of [401, 403, 429]) {
      m.authenticateApiKey.mockRejectedValue(new m.ApiAuthError(status, "nope"));
      expect(await fails(authenticateMcp(req("Bearer mps_live_abc")))).toMatchObject({ status });
    }
  });
});

describe("OAuth access tokens", () => {
  it("authenticate and carry the workspace and permissions the person chose", async () => {
    const ctx = await authenticateMcp(req("Bearer mpo_good"));
    expect(ctx).toEqual({ keyId: "oauth:t1", orgId: "o1", scopes: ["posts:read"], name: "Claude", via: "oauth", workspaceId: "w1", userId: "u1", client: "Claude" });
  });

  it("refuse missing, unknown, expired, revoked and deleted-org tokens, all alike", async () => {
    expect(await fails(authenticateMcp(req()))).toMatchObject({ status: 401 });
    expect(await fails(authenticateMcp(req("Bearer something_else")))).toMatchObject({ status: 401, invalidToken: true });
    for (const t of [null, goodToken({ accessExpiresAt: new Date(Date.now() - 1) }), goodToken({ revokedAt: new Date() }), goodToken({ org: { deletedAt: new Date() } })]) {
      m.token = t;
      expect(await fails(authenticateMcp(req("Bearer mpo_good")))).toMatchObject({ status: 401, invalidToken: true });
    }
  });

  it("stop working when the person who approved them can no longer approve them (left, suspended or demoted)", async () => {
    m.members = 0;
    expect(await fails(authenticateMcp(req("Bearer mpo_good")))).toMatchObject({ status: 401 });
  });

  it("stop working when the plan no longer includes API access", async () => {
    m.entitled = false;
    expect(await fails(authenticateMcp(req("Bearer mpo_good")))).toMatchObject({ status: 403 });
  });

  it("are rate limited, with Retry-After", async () => {
    m.rl = { ok: false, remaining: 0, resetAt: Date.now() + 30_000 };
    const e = await fails(authenticateMcp(req("Bearer mpo_good")));
    expect(e).toMatchObject({ status: 429 });
    expect(new Headers(e!.headers).get("Retry-After")).toBe("30");
  });
});
