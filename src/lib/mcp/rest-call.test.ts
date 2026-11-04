import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  db: {
    socialChannel: { findMany: vi.fn(), count: vi.fn() },
    post: { findFirst: vi.fn() },
    apiKey: { findUnique: vi.fn(async () => null) },
  },
  bumpUsage: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({ db: m.db }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: m.bumpUsage }));
vi.mock("@/lib/adapters/queue", () => ({ cancelPublish: vi.fn(), enqueuePublish: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));

// The REAL public-API handlers, wrapped by the real apiRoute: nothing between callRest and them is mocked.
import { GET as channels } from "@/app/api/v1/channels/route";
import { DELETE as deletePost } from "@/app/api/v1/posts/[id]/route";
import { callRest } from "./rest-call";
import type { McpContext } from "./auth";

const ctx = (scopes: McpContext["scopes"]): McpContext => ({ keyId: "k1", orgId: "o1", scopes, name: "Key", via: "key", workspaceId: null, userId: null, client: "Key" });

beforeEach(() => {
  vi.clearAllMocks();
  m.db.socialChannel.findMany.mockResolvedValue([
    { id: "c1", workspaceId: "w1", platform: "instagram", name: "Code", handle: "@code", followerCount: 3, queuePaused: false, socialAccount: { status: "connected", handle: "@code" } },
  ]);
  m.db.socialChannel.count.mockResolvedValue(1);
});

describe("running the real REST handlers in process", () => {
  it("serves a read as the already-authenticated caller, scoped to its organisation", async () => {
    const r = await callRest(channels, ctx(["channels:read"]), { method: "GET", path: "/api/v1/channels", query: { workspaceId: "w1", limit: 10 } });
    expect(r.ok).toBe(true);
    expect(r.data).toEqual([expect.objectContaining({ id: "c1", platform: "instagram", connectionStatus: "connected" })]);
    expect(r.meta).toMatchObject({ total: 1, limit: 10 });
    expect(m.db.socialChannel.findMany.mock.calls[0][0].where).toEqual({ workspace: { orgId: "o1" }, workspaceId: "w1" });
    expect(m.db.apiKey.findUnique).not.toHaveBeenCalled(); // no key lookup: the MCP layer already authenticated
    expect(m.bumpUsage).toHaveBeenCalledWith("o1", "api_calls"); // and the call is still metered
  });

  it("still enforces the scope the handler needs", async () => {
    const r = await callRest(channels, ctx(["posts:read"]), { method: "GET", path: "/api/v1/channels" });
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
    expect(r.error).toMatch(/channels:read/);
    expect(m.db.socialChannel.findMany).not.toHaveBeenCalled();
  });

  it("passes a non-GET through the same wrapper (origin check, body limit) and reports a refusal", async () => {
    m.db.post.findFirst.mockResolvedValue(null);
    const r = await callRest(deletePost, ctx(["posts:write"]), { method: "DELETE", path: "/api/v1/posts/p1", params: { id: "p1" } });
    expect(r).toMatchObject({ ok: false, status: 404, error: "Post not found" });
    expect(m.db.post.findFirst).toHaveBeenCalledWith({ where: { id: "p1", workspace: { orgId: "o1" } } });
  });
});
