import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { firstChannelWithoutRoom, placesLeft, scheduledCapacity, scheduledCountsByChannel, scheduledLimitMessage } from "./scheduled-limit";

vi.mock("@/lib/db", () => ({ db: { postChannel: { groupBy: vi.fn() } } }));

const counts = (o: Record<string, number>) => new Map(Object.entries(o));
const ch = (id: string, name = id) => ({ id, name });

describe("scheduledCountsByChannel", () => {
  beforeEach(() => vi.mocked(db.postChannel.groupBy).mockReset());

  it("counts the posts waiting on each channel of the organisation", async () => {
    vi.mocked(db.postChannel.groupBy).mockResolvedValue([
      { channelId: "c1", _count: { _all: 10 } },
      { channelId: "c2", _count: { _all: 4 } },
      { channelId: null, _count: { _all: 9 } },
    ] as never);
    expect([...(await scheduledCountsByChannel("org1")).entries()]).toEqual([["c1", 10], ["c2", 4]]);
    expect(vi.mocked(db.postChannel.groupBy).mock.calls[0][0]).toMatchObject({
      by: ["channelId"],
      where: { status: "scheduled", channelId: { not: null }, channel: { workspace: { orgId: "org1" } } },
    });
  });

  it("leaves one post out, so re-saving a scheduled post never counts against itself", async () => {
    vi.mocked(db.postChannel.groupBy).mockResolvedValue([] as never);
    await scheduledCountsByChannel("org1", "post9");
    expect(vi.mocked(db.postChannel.groupBy).mock.calls[0][0]).toMatchObject({ where: { postId: { not: "post9" } } });
  });
});

describe("firstChannelWithoutRoom (10 per channel)", () => {
  it("one full channel blocks a post that goes to it, even while the others have room", () => {
    const full = firstChannelWithoutRoom(10, counts({ a: 10, b: 2, c: 0 }), [ch("b"), ch("a", "Shop"), ch("c")]);
    expect(full).toEqual({ id: "a", name: "Shop", used: 10, limit: 10 });
  });

  it("a channel that has not reached the limit has room for one more", () => {
    expect(firstChannelWithoutRoom(10, counts({ a: 9 }), [ch("a")])).toBeNull();
  });

  it("three channels hold 30 in total: 10 on each", () => {
    const c = counts({ a: 10, b: 10, c: 9 });
    expect(firstChannelWithoutRoom(10, c, [ch("c")])).toBeNull();
    expect(firstChannelWithoutRoom(10, c, [ch("a")])).not.toBeNull();
  });

  it("0 is unlimited", () => {
    expect(firstChannelWithoutRoom(0, counts({ a: 5000 }), [ch("a")])).toBeNull();
  });
});

describe("placesLeft (recurring posts)", () => {
  it("the fullest channel decides how many copies fit", () => {
    expect(placesLeft(10, counts({ a: 7, b: 2 }), ["a", "b"])).toBe(3);
    expect(placesLeft(10, counts({ a: 10 }), ["a"])).toBe(0);
    expect(placesLeft(10, counts({ a: 12 }), ["a"])).toBe(0);
  });

  it("is unlimited when the limit is 0 or the post has no channel", () => {
    expect(placesLeft(0, counts({ a: 99 }), ["a"])).toBe(Infinity);
    expect(placesLeft(10, counts({}), [])).toBe(Infinity);
  });
});

describe("scheduledCapacity and the message", () => {
  it("is the per-channel limit for each connected channel, and never less than one channel's worth", () => {
    expect(scheduledCapacity(10, 3)).toBe(30);
    expect(scheduledCapacity(10, 1)).toBe(10);
    expect(scheduledCapacity(10, 0)).toBe(10);
    expect(scheduledCapacity(0, 3)).toBe(0);
  });

  it("tells the customer which channel is full and what to do", () => {
    const m = scheduledLimitMessage({ name: "Code", limit: 10 });
    expect(m).toContain("10 scheduled posts per channel");
    expect(m).toContain("Code already has 10");
    expect(m).toMatch(/Publish or unschedule one, or upgrade/);
  });
});
