import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import { PATCH } from "./[id]/route";
import { db } from "@/lib/db";
import { approvalBlockReason } from "@/lib/approval-gate";

vi.mock("@/lib/api/auth", () => ({
  authenticateApiKey: vi.fn(async () => ({ keyId: "k1", orgId: "org1", scopes: ["posts:write", "posts:read"], name: "key" })),
  ApiAuthError: class ApiAuthError extends Error {},
}));
vi.mock("@/lib/csrf", () => ({ originAllowed: () => true }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/queue", () => ({ enqueuePublish: vi.fn(), cancelPublish: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ orgEntitlements: vi.fn(async () => new Set(["platform_instagram"])), planLimit: vi.fn(async () => 0) }));
vi.mock("@/lib/idempotency", () => ({ claimIdempotencyKey: vi.fn(async () => true) }));
vi.mock("@/lib/approval-gate", () => ({ approvalBlockReason: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findFirst: vi.fn() },
    socialChannel: { findMany: vi.fn() },
    membership: { findFirst: vi.fn() },
    post: { create: vi.fn(), count: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  },
}));

const future = new Date(Date.now() + 86_400_000).toISOString();
const req = (body: unknown) => ({ method: "POST", headers: new Headers(), json: async () => body, nextUrl: { pathname: "/api/v1/posts" } }) as unknown as NextRequest;
const route = (id = "p1") => ({ params: Promise.resolve({ id }) });
const payload = (extra: Record<string, unknown> = {}) => ({ workspaceId: "ws1", channels: [{ channelId: "ch1", body: "Hello" }], ...extra });

beforeEach(() => {
  vi.mocked(db.workspace.findFirst).mockReset().mockResolvedValue({ id: "ws1", requireApproval: true } as never);
  vi.mocked(db.socialChannel.findMany).mockReset().mockResolvedValue([{ id: "ch1", platform: "instagram" }] as never);
  vi.mocked(db.membership.findFirst).mockReset().mockResolvedValue({ userId: "owner1" } as never);
  vi.mocked(db.post.count).mockReset().mockResolvedValue(0);
  vi.mocked(db.post.create).mockReset().mockResolvedValue({ id: "p1", workspaceId: "ws1", title: "Hello", status: "draft", scheduledAt: null, channels: [{ platform: "instagram", body: "Hello", status: "pending" }] } as never);
  vi.mocked(db.post.findFirst).mockReset().mockResolvedValue({ id: "p1", status: "draft", workspaceId: "ws1" } as never);
  vi.mocked(db.post.update).mockReset().mockResolvedValue({ id: "p1", title: "t", status: "scheduled", scheduledAt: new Date(future) } as never);
  vi.mocked(approvalBlockReason).mockReset().mockResolvedValue(null);
});

describe("POST /api/v1/posts in a workspace that requires approval", () => {
  it("refuses to schedule a brand-new post, and says how to proceed", async () => {
    const res = await POST(req(payload({ scheduledAt: future })), route());
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toMatch(/requires approval/i);
    expect(db.post.create).not.toHaveBeenCalled();
  });

  it("still accepts a draft", async () => {
    const res = await POST(req(payload()), route());
    expect(res.status).toBe(201);
    expect(vi.mocked(db.post.create).mock.calls[0][0].data).toMatchObject({ status: "draft", scheduledAt: null });
  });

  it("is unchanged where approval is optional: scheduling works", async () => {
    vi.mocked(db.workspace.findFirst).mockResolvedValue({ id: "ws1", requireApproval: false } as never);
    const res = await POST(req(payload({ scheduledAt: future })), route());
    expect(res.status).toBe(201);
  });
});

describe("PATCH /api/v1/posts/:id (reschedule)", () => {
  it("refuses to schedule a post that is not approved, with the reason", async () => {
    vi.mocked(approvalBlockReason).mockResolvedValue("This workspace requires approval before publishing. This post is still waiting for approval.");
    const res = await PATCH(req({ scheduledAt: future }), route());
    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toMatch(/still waiting for approval/);
    expect(db.post.update).not.toHaveBeenCalled();
  });

  it("allows it once approved", async () => {
    const res = await PATCH(req({ scheduledAt: future }), route());
    expect(res.status).toBe(200);
    expect(db.post.update).toHaveBeenCalled();
  });

  it("does not ask about approval when only the title changes or the post is unscheduled", async () => {
    await PATCH(req({ title: "New title" }), route());
    await PATCH(req({ scheduledAt: null }), route());
    expect(approvalBlockReason).not.toHaveBeenCalled();
  });
});
