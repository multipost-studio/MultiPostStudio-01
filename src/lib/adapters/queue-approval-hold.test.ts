import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ publish: vi.fn() }));

vi.mock("@/lib/env", () => ({ isProduction: false }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), notifyWorkspace: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ debumpUsage: vi.fn() }));
vi.mock("@/lib/streak-service", () => ({ notifyStreakMilestone: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ isDeadTokenError: vi.fn(() => false), markAccountExpired: vi.fn() }));
vi.mock("@/lib/kill-switches", () => ({ pausedMessage: vi.fn(async () => null) }));
vi.mock("@/lib/adapters/publish", () => ({
  canPublishReal: vi.fn(() => false),
  isRetryablePublishError: vi.fn(() => false),
  publishToPlatform: (...a: unknown[]) => m.publish(...a),
  postFirstComment: vi.fn(),
  logPublishFailure: vi.fn(),
}));

let postRow: Record<string, unknown>;
// Models the held path never touches (the full publish path reads a few more) answer with empty results.
const empty = (model: Record<string, unknown>) =>
  new Proxy(model, {
    get: (t, k: string) => (k in t ? t[k] : async () => (k === "findMany" ? [] : k === "count" ? 0 : null)),
  });
vi.mock("@/lib/db", () => ({
  db: new Proxy({
    publishJob: {
      updateMany: vi.fn(async ({ where }: { where: { id?: string } }) => ({ count: where.id ? 1 : 0 })),
      findMany: vi.fn(async () => [{ id: "j1", postId: "p1", attempts: 0, lastError: null, status: "queued" }]),
      findUnique: vi.fn(async () => ({ status: "running" })),
      update: vi.fn(async () => ({})),
    },
    post: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => postRow),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    postChannel: { update: vi.fn(), updateMany: vi.fn() },
    postMetric: { create: vi.fn() },
    approvalRequest: { findMany: vi.fn(async () => []) },
    socialAccount: { findUnique: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => null) },
    activityEvent: { create: vi.fn() },
  } as Record<string, unknown>, {
    get: (t, k: string) => (k in t ? t[k] : empty({})),
  }),
}));

import { db } from "@/lib/db";
import { notifyWorkspace } from "@/lib/events";
import { runDueJobs } from "./queue";

const channel = (id: string, status: string, body = "Hello") => ({ id, status, platform: "instagram", body, channel: null });
const post = (requireApproval: boolean, channels = [channel("c1", "scheduled")]) => ({
  id: "p1",
  title: "Launch",
  workspaceId: "w1",
  authorId: "a",
  firstComment: null,
  channels,
  media: [],
  workspace: { orgId: "org1", slug: "s", requireApproval },
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.approvalRequest.findMany).mockResolvedValue([]);
});

describe("mandatory approval at publish time", () => {
  it("holds an unapproved post: job cancelled, post back to draft, channels pending, workspace told, nothing published", async () => {
    postRow = post(true);
    const { processed } = await runDueJobs(new Date());
    expect(processed).toBe(0);
    const job = vi.mocked(db.publishJob.update).mock.calls.map((c) => c[0] as { data: Record<string, unknown> }).find((u) => u.data.status === "canceled");
    expect(job!.data).toMatchObject({ status: "canceled", leaseUntil: null, lastError: "held: approval required" });
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "draft", scheduledAt: null } });
    expect(vi.mocked(db.postChannel.updateMany).mock.calls[0][0]).toMatchObject({ where: { postId: "p1", status: { notIn: ["published", "skipped"] } }, data: { status: "pending" } });
    expect(notifyWorkspace).toHaveBeenCalledWith("w1", expect.objectContaining({ title: "Post held: approval required" }));
    expect(m.publish).not.toHaveBeenCalled();
  });

  it("holds a post edited after it was approved", async () => {
    postRow = post(true, [channel("c1", "scheduled", "Edited text")]);
    vi.mocked(db.approvalRequest.findMany).mockResolvedValue([
      { status: "approved", approvedSnapshot: JSON.stringify({ channels: [{ platform: "instagram", body: "Approved text" }] }) },
    ] as never);
    await runDueJobs(new Date());
    expect(db.post.update).toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "draft", scheduledAt: null } });
  });

  it("lets an approved post through untouched", async () => {
    postRow = post(true);
    vi.mocked(db.approvalRequest.findMany).mockResolvedValue([
      { status: "approved", approvedSnapshot: JSON.stringify({ channels: [{ platform: "instagram", body: "Hello" }] }) },
    ] as never);
    await runDueJobs(new Date());
    expect(db.post.update).not.toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "draft", scheduledAt: null } });
    expect(notifyWorkspace).not.toHaveBeenCalledWith("w1", expect.objectContaining({ title: "Post held: approval required" }));
  });

  it("does nothing, and asks nothing, while approval is optional", async () => {
    postRow = post(false);
    await runDueJobs(new Date());
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
    expect(db.post.update).not.toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "draft", scheduledAt: null } });
  });

  it("leaves a post alone when it has already gone out on some channels: it is only being completed", async () => {
    postRow = post(true, [channel("c1", "scheduled"), channel("c2", "published")]);
    await runDueJobs(new Date());
    expect(db.approvalRequest.findMany).not.toHaveBeenCalled();
    expect(db.post.update).not.toHaveBeenCalledWith({ where: { id: "p1" }, data: { status: "draft", scheduledAt: null } });
  });
});
