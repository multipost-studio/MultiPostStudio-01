import { createHash, randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ clients: [] as Row[], requests: [] as Row[], tokens: [] as Row[], role: "owner" }));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => matches(row, w));
    return v === null ? row[k] == null : row[k] === v;
  });
const find = (rows: Row[], where: Row) => rows.find((r) => matches(r, where)) ?? null;

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ appUrl: (p = "") => `https://app.example.com${p}` }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock("@/lib/entitlements", () => ({ hasEntitlement: vi.fn(async () => true), planLimit: vi.fn(async () => 0) }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: async () => "9.9.9.9",
  rateLimit: vi.fn(async () => ({ ok: true, remaining: 99, resetAt: Date.now() + 1000 })),
  rateLimitHeaders: () => ({}),
  retryAfterSec: () => 1,
}));
vi.mock("@/lib/session", () => ({
  getWorkspaceContext: vi.fn(async () => ({
    user: { id: "u1", email: "me@example.com", isImpersonated: false },
    workspaces: [{ workspace: { id: "w1", name: "Main" }, org: { id: "o1", name: "Acme" }, orgRole: "owner", workspaceRole: null, customPerms: null }],
    active: {},
  })),
}));
// Tool back-ends the flow doesn't exercise.
vi.mock("@/app/api/v1/channels/route", () => ({ GET: vi.fn() }));
vi.mock("@/app/api/v1/posts/route", () => ({ GET: vi.fn(), POST: vi.fn() }));
vi.mock("@/app/api/v1/posts/[id]/route", () => ({ GET: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() }));
vi.mock("@/app/api/v1/analytics/route", () => ({ GET: vi.fn() }));

vi.mock("@/lib/db", () => ({
  db: {
    oAuthClient: {
      count: async () => store.clients.length,
      create: async ({ data }: { data: Row }) => {
        const c = { createdAt: new Date(), ...data };
        store.clients.push(c);
        return c;
      },
      findUnique: async ({ where }: { where: Row }) => find(store.clients, where),
    },
    oAuthAuthRequest: {
      create: async ({ data }: { data: Row }) => {
        const r = { codeHash: null, usedAt: null, ...data };
        store.requests.push(r);
        return r;
      },
      findUnique: async ({ where }: { where: Row }) => {
        const r = find(store.requests, where);
        return r ? { ...r, client: find(store.clients, { id: r.clientId }) } : null;
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = store.requests.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      },
      deleteMany: async () => ({ count: 0 }),
    },
    oAuthToken: {
      create: async ({ data }: { data: Row }) => {
        const t = { id: `t${store.tokens.length + 1}`, revokedAt: null, lastUsedAt: null, prevRefreshHash: null, createdAt: new Date(), ...data };
        store.tokens.push(t);
        return t;
      },
      findUnique: async ({ where }: { where: Row }) => {
        const t = find(store.tokens, where);
        return t ? { ...t, client: find(store.clients, { id: t.clientId }), org: { deletedAt: null } } : null;
      },
      findFirst: async ({ where }: { where: Row }) => find(store.tokens, where),
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = store.tokens.filter((t) => matches(t, where));
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      },
      update: async ({ where, data }: { where: Row; data: Row }) => Object.assign(find(store.tokens, where) ?? {}, data),
    },
    membership: { findFirst: async () => ({ role: store.role, customRole: null }) },
    organization: { findUnique: async () => ({ id: "o1", name: "Acme" }) },
    workspace: { findMany: async () => [{ id: "w1", name: "Main", timezone: null }], findFirst: async () => ({ members: [] }) },
  },
}));

import { POST as register } from "@/app/api/mcp-oauth/register/route";
import { GET as authorize } from "@/app/api/mcp-oauth/authorize/route";
import { POST as tokenEndpoint } from "@/app/api/mcp-oauth/token/route";
import { POST as revokeEndpoint } from "@/app/api/mcp-oauth/revoke/route";
import { POST as mcp } from "@/app/api/mcp/route";
import { approveAiAccessAction } from "@/app/actions/mcp-oauth";

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");

const form = (body: Record<string, string>) =>
  new NextRequest("https://app.example.com/api/mcp-oauth/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body).toString() });
const rpc = (token: string, method: string, params?: unknown) =>
  mcp(new NextRequest("https://app.example.com/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));

/** Steps 1 to 4 of connecting an assistant, the way Claude would. */
async function connect(scopes: string[]) {
  const reg = await (await register(new NextRequest("https://app.example.com/api/mcp-oauth/register", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_name: "Claude", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }) }))).json();
  const q = new URLSearchParams({ response_type: "code", client_id: reg.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "st-1", resource: "https://app.example.com/api/mcp" });
  const start = await authorize(new NextRequest(`https://app.example.com/api/mcp-oauth/authorize?${q}`));
  expect(start.status).toBe(302);
  const requestId = new URL(start.headers.get("Location")!).searchParams.get("request")!;

  const fd = new FormData();
  fd.set("request", requestId);
  fd.set("target", "org:o1");
  scopes.forEach((s) => fd.append("scopes", s));
  const approved = await approveAiAccessAction(fd);
  expect(approved.ok).toBe(true);
  const back = new URL(approved.redirectTo!);
  expect(back.origin + back.pathname).toBe(REDIRECT);
  expect(back.searchParams.get("state")).toBe("st-1");

  const tokens = await (await tokenEndpoint(form({ grant_type: "authorization_code", client_id: reg.client_id, code: back.searchParams.get("code")!, redirect_uri: REDIRECT, code_verifier: verifier }))).json();
  return { clientId: reg.client_id as string, code: back.searchParams.get("code")!, tokens };
}

beforeEach(() => {
  store.clients = [];
  store.requests = [];
  store.tokens = [];
  store.role = "owner";
});

describe("connecting an assistant, end to end", () => {
  it("registers, is approved by a person, gets tokens, and can then use exactly the tools it was allowed", async () => {
    const { tokens } = await connect(["posts:read", "channels:read"]);
    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "posts:read channels:read" });

    const list = await (await rpc(tokens.access_token, "tools/list")).json();
    const names = list.result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual(["get_account", "list_channels", "get_channel", "list_posts", "get_post"]);

    const account = await (await rpc(tokens.access_token, "tools/call", { name: "get_account", arguments: {} })).json();
    const data = JSON.parse(account.result.content[0].text).data;
    expect(data.organization).toEqual({ id: "o1", name: "Acme" });
    expect(data.connection).toMatchObject({ type: "oauth", name: "Claude", limitedToWorkspaceId: null });

    const forbidden = await (await rpc(tokens.access_token, "tools/call", { name: "create_post", arguments: {} })).json();
    expect(forbidden.result.isError).toBe(true);
  });

  it("is refused before approval and for tokens it never issued", async () => {
    expect((await rpc("mpo_made_up", "tools/list")).status).toBe(401);
    expect((await rpc("", "tools/list")).status).toBe(401);
  });

  it("refreshing replaces both tokens, and the old access token stops working at once", async () => {
    const { clientId, tokens } = await connect(["posts:read"]);
    const next = await (await tokenEndpoint(form({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token }))).json();
    expect(next.access_token).toBeDefined();
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
    expect((await rpc(next.access_token, "tools/list")).status).toBe(200);
    const replay = await tokenEndpoint(form({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token }));
    expect(replay.status).toBe(400);
  });

  it("a code can't be used twice, or by someone without the verifier", async () => {
    const { clientId, code } = await connect(["posts:read"]);
    const again = await tokenEndpoint(form({ grant_type: "authorization_code", client_id: clientId, code, redirect_uri: REDIRECT, code_verifier: verifier }));
    expect(again.status).toBe(400);
    expect((await again.json()).error).toBe("invalid_grant");
  });

  it("revoking cuts the assistant off", async () => {
    const { tokens } = await connect(["posts:read"]);
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(200);
    const res = await revokeEndpoint(new NextRequest("https://app.example.com/api/mcp-oauth/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `token=${tokens.refresh_token}` }));
    expect(res.status).toBe(200);
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
  });

  it("a connection ends when the person who approved it is demoted, and can't be refreshed back to life", async () => {
    const { clientId, tokens } = await connect(["posts:read"]);
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(200);
    store.role = "viewer";
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
    const refreshed = await tokenEndpoint(form({ grant_type: "refresh_token", client_id: clientId, refresh_token: tokens.refresh_token }));
    expect(refreshed.status).toBe(400);
    store.role = "owner"; // even if they are promoted again, the connection was ended
    expect((await rpc(tokens.access_token, "tools/list")).status).toBe(401);
  });

  it("a 401 tells the assistant where to start signing in", async () => {
    const res = await rpc("mpo_made_up", "tools/list");
    expect(res.headers.get("WWW-Authenticate")).toContain("https://app.example.com/.well-known/oauth-protected-resource");
  });
});
