import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { planLimit } from "@/lib/entitlements";
import { validateStoredPost } from "@/lib/post-validation";
import { schedulePostAction } from "./posts";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), notify: vi.fn(), notifyMentions: vi.fn() }));
vi.mock("@/lib/adapters/queue", () => ({ enqueuePublish: vi.fn(), cancelPublish: vi.fn(), runDueJobs: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ dispatchWebhook: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(), debumpUsage: vi.fn() }));
vi.mock("@/lib/scheduling", () => ({ nextAvailableSlot: vi.fn() }));
vi.mock("@/lib/scoring", () => ({ scorePost: vi.fn() }));
vi.mock("@/lib/plan-gates", () => ({ planBlockedChannels: vi.fn(async () => new Map()) }));
vi.mock("@/lib/approval-gate", () => ({ approvalBlockReason: vi.fn(async () => null) }));
vi.mock("@/lib/compliance", () => ({ parseComplianceRules: () => ({ forbiddenWords: [], disclaimerTriggers: [] }), lintCompliance: () => [] }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/post-validation", () => ({ validateStoredPost: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ planLimit: vi.fn() }));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn(async () => ({ active: { org: { id: "org1" }, workspace: { id: "ws1" } }, user: { id: "u1" } })),
  ensureInWorkspace: vi.fn(),
  limitGuard: vi.fn(),
  entitlementGuard: vi.fn(),
  featureGuard: vi.fn(),
  snapshotPostVersion: vi.fn(),
  scopedCampaignRefs: vi.fn(),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    postChannel: { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn(), updateMany: vi.fn() },
    post: { findUnique: vi.fn(), update: vi.fn() },
    workspace: { findUnique: vi.fn() },
  },
}));

const when = new Date(Date.now() + 3600_000).toISOString();
const channelsOf = (...ids: string[]) => ids.map((id) => ({ channelId: id, name: id, valid: true, errors: [] as string[] }));

beforeEach(() => {
  vi.mocked(planLimit).mockReset().mockResolvedValue(10);
  vi.mocked(db.postChannel.count).mockReset().mockResolvedValue(0 as never);
  vi.mocked(db.postChannel.findMany).mockReset();
  vi.mocked(db.postChannel.groupBy).mockReset().mockResolvedValue([] as never);
  vi.mocked(db.postChannel.updateMany).mockReset().mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.post.findUnique).mockReset().mockResolvedValue({ status: "draft" } as never);
  vi.mocked(db.post.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.workspace.findUnique).mockReset().mockResolvedValue(null as never);
  vi.mocked(validateStoredPost).mockReset();
});

function postGoesTo(...ids: string[]) {
  vi.mocked(validateStoredPost).mockResolvedValue({
    channels: channelsOf(...ids),
    channelBodies: ids.map((id) => ({ channelId: id, name: id, body: "hello" })),
    workspaceId: "ws1",
  } as never);
  vi.mocked(db.postChannel.findMany).mockResolvedValue(ids.map((id) => ({ channelId: id, channel: { name: id.toUpperCase() } })) as never);
}
const waiting = (o: Record<string, number>) =>
  vi.mocked(db.postChannel.groupBy).mockResolvedValue(Object.entries(o).map(([channelId, n]) => ({ channelId, _count: { _all: n } })) as never);

describe("schedulePostAction: scheduled posts are limited per channel", () => {
  it("schedules while every channel the post goes to has a free place (3 channels can hold 30)", async () => {
    postGoesTo("a", "b", "c");
    waiting({ a: 9, b: 10, c: 0 }); // b is full but this post doesn't go to b
    postGoesTo("a", "c");
    expect(await schedulePostAction("p1", when)).toMatchObject({ ok: true });
    expect(db.post.update).toHaveBeenCalled();
  });

  it("refuses a post that goes to a full channel, and names the channel", async () => {
    postGoesTo("a", "b");
    waiting({ a: 3, b: 10 });
    const r = await schedulePostAction("p1", when);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("10 scheduled posts per channel");
    expect((r as { error: string }).error).toContain("B already has 10");
    expect(db.post.update).not.toHaveBeenCalled();
  });

  it("a post to several channels needs a place on each", async () => {
    postGoesTo("a", "b", "c");
    waiting({ a: 10, b: 10, c: 10 });
    expect(await schedulePostAction("p1", when)).toMatchObject({ ok: false });
  });

  it("does not count the post's own earlier places against it when it is saved again", async () => {
    postGoesTo("a");
    // the query asks for everyone else's posts only
    waiting({ a: 9 });
    expect(await schedulePostAction("p1", when)).toMatchObject({ ok: true });
    expect(vi.mocked(db.postChannel.groupBy).mock.calls[0][0]).toMatchObject({ where: { postId: { not: "p1" } } });
  });

  it("a channel left out of a partial publish does not need a place", async () => {
    vi.mocked(validateStoredPost).mockResolvedValue({
      channels: [{ channelId: "a", name: "a", valid: true, errors: [] }, { channelId: "b", name: "b", valid: false, errors: ["too long"] }],
      channelBodies: [{ channelId: "a", name: "a", body: "x" }, { channelId: "b", name: "b", body: "x" }],
      workspaceId: "ws1",
    } as never);
    vi.mocked(db.postChannel.findMany).mockResolvedValue([{ channelId: "a", channel: { name: "A" } }, { channelId: "b", channel: { name: "B" } }] as never);
    waiting({ a: 1, b: 10 });
    expect(await schedulePostAction("p1", when, { publishValidOnly: true })).toMatchObject({ ok: true });
  });

  it("a plan limit of 0 is unlimited", async () => {
    vi.mocked(planLimit).mockResolvedValue(0);
    postGoesTo("a");
    waiting({ a: 99999 });
    expect(await schedulePostAction("p1", when)).toMatchObject({ ok: true });
  });
});
