import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ auth: vi.fn(), tools: [] as unknown[] }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ appUrl: (p = "") => `https://app.example.com${p}` }));
vi.mock("@/lib/mcp/auth", async () => {
  class McpAuthError extends Error {
    constructor(
      public status: number,
      message: string,
      public headers?: HeadersInit,
      public invalidToken = false,
    ) {
      super(message);
    }
  }
  return { McpAuthError, authenticateMcp: m.auth };
});
vi.mock("@/lib/mcp/tools", () => ({
  listTools: () => m.tools,
  lookupTool: (name: string) => (name === "known" ? "ok" : "unknown"),
  callTool: vi.fn(async () => ({ content: [{ type: "text", text: "{}" }] })),
}));

import { McpAuthError } from "@/lib/mcp/auth";
import { DELETE, GET, OPTIONS, POST } from "./route";

const ctx = { keyId: "k", orgId: "o", scopes: ["posts:read"], name: "n", via: "key", workspaceId: null, userId: null, client: "n" };
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest("https://app.example.com/api/mcp", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer mps_live_x", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const rpc = (method: string, id: number | null = 1, params?: unknown) => ({ jsonrpc: "2.0", method, ...(id !== null ? { id } : {}), ...(params ? { params } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue(ctx);
  m.tools = [{ name: "get_account" }];
});

describe("POST /api/mcp", () => {
  it("points an unauthenticated caller at the OAuth metadata", async () => {
    m.auth.mockRejectedValue(new McpAuthError(401, "Authentication required."));
    const res = await POST(post(rpc("ping")));
    expect(res.status).toBe(401);
    expect(res.headers.get("WWW-Authenticate")).toBe('Bearer resource_metadata="https://app.example.com/.well-known/oauth-protected-resource"');
    expect((await res.json()).error.message).toBe("Authentication required.");
  });

  it("says invalid_token when a token was sent but is no good, and relays 429 with Retry-After", async () => {
    m.auth.mockRejectedValue(new McpAuthError(401, "bad", undefined, true));
    expect((await POST(post(rpc("ping")))).headers.get("WWW-Authenticate")).toContain('error="invalid_token"');
    m.auth.mockRejectedValue(new McpAuthError(429, "slow", { "Retry-After": "30" }));
    const limited = await POST(post(rpc("ping")));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("30");
  });

  it("answers initialize and tools/list as JSON-RPC", async () => {
    const init = await (await POST(post(rpc("initialize", 1, { protocolVersion: "2025-03-26" })))).json();
    expect(init).toMatchObject({ jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-03-26", serverInfo: { name: "multipost-studio" } } });
    const list = await (await POST(post(rpc("tools/list", 2)))).json();
    expect(list.result.tools).toEqual([{ name: "get_account" }]);
  });

  it("offers its own newest version when the client asks for one it doesn't know", async () => {
    const init = await (await POST(post(rpc("initialize", 1, { protocolVersion: "1999-01-01" })))).json();
    expect(init.result.protocolVersion).toBe("2025-06-18");
  });

  it("accepts a notification with 202 and no body", async () => {
    const res = await POST(post(rpc("notifications/initialized", null)));
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  it("handles a batch and skips the notifications in it", async () => {
    const res = await POST(post([rpc("ping", 1), rpc("notifications/initialized", null), rpc("tools/list", 2)]));
    const out = await res.json();
    expect(out.map((r: { id: number }) => r.id)).toEqual([1, 2]);
  });

  it("refuses bad JSON, an empty or oversized batch, and a body that is too large", async () => {
    expect((await POST(post("{not json"))).status).toBe(400);
    expect((await POST(post([]))).status).toBe(400);
    expect((await POST(post(Array.from({ length: 6 }, () => rpc("ping"))))).status).toBe(400);
    expect((await POST(post(JSON.stringify({ pad: "x".repeat(1_100_000) })))).status).toBe(413);
  });

  it("reports an unknown method, a bad message and an unknown tool as protocol errors", async () => {
    expect((await (await POST(post(rpc("nope")))).json()).error.code).toBe(-32601);
    expect((await (await POST(post({ hello: "world" }))).json()).error.code).toBe(-32600);
    expect((await (await POST(post(rpc("tools/call", 1, { name: "ghost" })))).json()).error.code).toBe(-32602);
    expect((await (await POST(post(rpc("tools/call", 1, {})))).json()).error.code).toBe(-32602);
  });

  it("runs a known tool", async () => {
    const out = await (await POST(post(rpc("tools/call", 1, { name: "known", arguments: {} })))).json();
    expect(out.result.content[0].text).toBe("{}");
  });

  it("serves the one prompt", async () => {
    const list = await (await POST(post(rpc("prompts/list", 1)))).json();
    expect(list.result.prompts[0].name).toBe("review_weekly_posts");
    const got = await (await POST(post(rpc("prompts/get", 2, { name: "review_weekly_posts" })))).json();
    expect(got.result.messages[0].content.text).toMatch(/Don't change anything/);
    expect((await (await POST(post(rpc("prompts/get", 3, { name: "x" })))).json()).error).toBeDefined();
  });
});

describe("other methods", () => {
  it("has no stream or session to offer: GET and DELETE are 405, OPTIONS allows cross-origin clients", async () => {
    expect(GET().status).toBe(405);
    expect(DELETE().status).toBe(405);
    expect(GET().headers.get("Allow")).toContain("POST");
    const pre = OPTIONS();
    expect(pre.status).toBe(204);
    expect(pre.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
  });
});
