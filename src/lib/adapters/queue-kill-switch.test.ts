import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ paused: vi.fn<(...a: unknown[]) => Promise<string | null>>(), publish: vi.fn() }));

vi.mock("@/lib/env", () => ({ isProduction: false }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), notifyWorkspace: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ debumpUsage: vi.fn() }));
vi.mock("@/lib/streak-service", () => ({ notifyStreakMilestone: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ isDeadTokenError: vi.fn(() => false), markAccountExpired: vi.fn() }));
vi.mock("@/lib/kill-switches", () => ({ pausedMessage: (...a: unknown[]) => m.paused(...a) }));
vi.mock("@/lib/adapters/publish", () => ({
  canPublishReal: vi.fn(() => false),
  isRetryablePublishError: vi.fn(() => false),
  publishToPlatform: (...a: unknown[]) => m.publish(...a),
  postFirstComment: vi.fn(),
  logPublishFailure: vi.fn(),
}));
vi.mock("@/lib/db", () => ({
  db: {
    publishJob: {
      updateMany: vi.fn(async ({ where }: { where: { id?: string } }) => ({ count: where.id ? 1 : 0 })),
      findMany: vi.fn(async () => [{ id: "j1", postId: "p1", attempts: 0, lastError: null, status: "queued" }]),
      findUnique: vi.fn(async () => ({ status: "running" })),
      update: vi.fn(async () => ({})),
    },
    post: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => ({
        id: "p1",
        title: "t",
        workspaceId: "w1",
        authorId: "a",
        firstComment: null,
        channels: [
          { id: "c1", status: "pending", platform: "instagram", channel: null },
          { id: "c2", status: "published", platform: "facebook", channel: null },
          { id: "c3", status: "skipped", platform: "x", channel: null },
        ],
        media: [],
        workspace: { orgId: "org1", slug: "s" },
      })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    postChannel: { update: vi.fn(), updateMany: vi.fn() },
    postMetric: { create: vi.fn() },
    socialAccount: { findUnique: vi.fn(async () => null) },
    user: { findUnique: vi.fn(async () => null) },
    activityEvent: { create: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { runDueJobs } from "./queue";

beforeEach(() => {
  vi.clearAllMocks();
  m.paused.mockResolvedValue(null);
});

describe("publishing kill switch in the queue", () => {
  it("holds the job without failing it: back to queued, the counted attempt returned, nothing published", async () => {
    m.paused.mockResolvedValue("Publishing is paused by MultiPost Studio for now.");
    const { processed } = await runDueJobs(new Date());
    expect(processed).toBe(0);
    const update = vi.mocked(db.publishJob.update).mock.calls.map((c) => c[0] as { where: { id: string }; data: Record<string, unknown> });
    const held = update.find((u) => u.data.status === "queued");
    expect(held).toBeDefined();
    expect(held!.data).toMatchObject({ status: "queued", leaseUntil: null, attempts: { decrement: 1 }, lastError: "Publishing is paused by MultiPost Studio for now." });
    expect((held!.data.runAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(update.some((u) => u.data.status === "failed" || u.data.status === "done")).toBe(false);
    expect(m.publish).not.toHaveBeenCalled();
    expect(db.post.update).not.toHaveBeenCalled();
  });

  it("asks about the organization and only the platforms still waiting to go out", async () => {
    m.paused.mockResolvedValue("held");
    await runDueJobs(new Date());
    expect(m.paused).toHaveBeenCalledWith("publishing", { orgId: "org1", providers: ["instagram"] });
  });
});
