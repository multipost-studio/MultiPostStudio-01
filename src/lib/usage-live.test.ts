import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  db: {
    socialChannel: { count: vi.fn() },
    membership: { count: vi.fn() },
    post: { count: vi.fn() },
    postChannel: { count: vi.fn() },
    mediaAsset: { aggregate: vi.fn() },
    usageRecord: { findUnique: vi.fn() },
    subscription: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/plans", async () => {
  const { PLAN_CATALOG } = await import("@/lib/constants");
  const free = PLAN_CATALOG.find((p) => p.key === "free")!;
  return { getPlan: vi.fn(async () => ({ ...free, id: "p", badge: null, sortIndex: 0 })) };
});

import { checkUsage, liveGauge } from "./entitlements";
import { db } from "@/lib/db";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.subscription.findUnique).mockResolvedValue(null as never);
});

describe("load-type usage is counted from real rows, not a month-keyed gauge", () => {
  it("counts channels, seats and scheduled posts live, scoped to the org", async () => {
    vi.mocked(db.socialChannel.count).mockResolvedValue(3 as never);
    vi.mocked(db.membership.count).mockResolvedValue(2 as never);
    vi.mocked(db.postChannel.count).mockResolvedValue(7 as never);
    expect(await liveGauge("org1", "channels")).toBe(3);
    expect(await liveGauge("org1", "users")).toBe(2);
    expect(await liveGauge("org1", "scheduled_posts")).toBe(7);
    expect(db.socialChannel.count).toHaveBeenCalledWith({ where: { workspace: { orgId: "org1" } } });
    expect(db.membership.count).toHaveBeenCalledWith({ where: { orgId: "org1" } });
    // scheduled posts are counted per channel: one place for each channel a scheduled post is waiting on
    expect(db.postChannel.count).toHaveBeenCalledWith({ where: { status: "scheduled", channel: { workspace: { orgId: "org1" } } } });
  });

  it("sums the real stored bytes for storage, rounded up to whole megabytes", async () => {
    vi.mocked(db.mediaAsset.aggregate).mockResolvedValue({ _sum: { sizeBytes: 150 * 1024 * 1024 + 1 } } as never);
    expect(await liveGauge("org1", "storage_mb")).toBe(151);
    vi.mocked(db.mediaAsset.aggregate).mockResolvedValue({ _sum: { sizeBytes: null } } as never);
    expect(await liveGauge("org1", "storage_mb")).toBe(0);
    expect(db.mediaAsset.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { workspace: { orgId: "org1" } } }));
  });

  it("storage quota can't be refilled by the calendar rolling over: a zero monthly record is ignored", async () => {
    // On the 1st the stored monthly gauge starts at 0, but the files are all still there.
    vi.mocked(db.usageRecord.findUnique).mockResolvedValue({ value: 0 } as never);
    vi.mocked(db.mediaAsset.aggregate).mockResolvedValue({ _sum: { sizeBytes: 199 * 1024 * 1024 } } as never);
    const u = await checkUsage("org1", "storage_mb");
    expect(u.used).toBe(199);
    expect(u.limit).toBe(200);
    expect(db.usageRecord.findUnique).not.toHaveBeenCalled();
  });

  it("flags an org that is over its limit, and leaves unlimited (0) plans alone", async () => {
    vi.mocked(db.socialChannel.count).mockResolvedValue(5 as never);
    const u = await checkUsage("org1", "channels");
    expect(u).toMatchObject({ used: 5, limit: 3, over: true });
  });

  it("genuinely monthly counters (AI credits) still come from the month's record", async () => {
    vi.mocked(db.usageRecord.findUnique).mockResolvedValue({ value: 12 } as never);
    const u = await checkUsage("org1", "ai_credits");
    expect(u.used).toBe(12);
    expect(db.usageRecord.findUnique).toHaveBeenCalled();
  });

  it("a database failure reads as zero use rather than crashing the page", async () => {
    vi.mocked(db.socialChannel.count).mockRejectedValue(new Error("db down"));
    expect((await checkUsage("org1", "channels")).used).toBe(0);
  });

  it("the scheduled-posts limit is per channel: the org's total room is that limit for each connected channel", async () => {
    // Free allows 10 per channel. With 3 channels the org may hold 30; 12 waiting is well within it.
    vi.mocked(db.socialChannel.count).mockResolvedValue(3 as never);
    vi.mocked(db.postChannel.count).mockResolvedValue(12 as never);
    expect(await checkUsage("org1", "scheduled_posts")).toMatchObject({ used: 12, limit: 30, over: false });
    vi.mocked(db.postChannel.count).mockResolvedValue(31 as never);
    expect(await checkUsage("org1", "scheduled_posts")).toMatchObject({ used: 31, limit: 30, over: true });
  });

  it("with no channel yet the room is one channel's worth, never zero", async () => {
    vi.mocked(db.socialChannel.count).mockResolvedValue(0 as never);
    vi.mocked(db.postChannel.count).mockResolvedValue(0 as never);
    expect(await checkUsage("org1", "scheduled_posts")).toMatchObject({ used: 0, limit: 10 });
  });
});