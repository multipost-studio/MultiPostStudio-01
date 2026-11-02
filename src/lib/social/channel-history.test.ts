import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { keepPublishedHistory } from "./channel-history";

vi.mock("@/lib/db", () => ({ db: { postChannel: { updateMany: vi.fn(), deleteMany: vi.fn() } } }));

beforeEach(() => {
  vi.mocked(db.postChannel.updateMany).mockReset().mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.postChannel.deleteMany).mockReset().mockResolvedValue({ count: 0 } as never);
});

describe("keepPublishedHistory", () => {
  it("writes the channel's @handle on its published posts before anything is deleted", async () => {
    await keepPublishedHistory([
      { id: "c1", handle: "@shop" },
      { id: "c2", handle: "@other" },
    ]);
    expect(db.postChannel.updateMany).toHaveBeenCalledWith({ where: { channelId: "c1", status: "published" }, data: { channelLabel: "@shop" } });
    expect(db.postChannel.updateMany).toHaveBeenCalledWith({ where: { channelId: "c2", status: "published" }, data: { channelLabel: "@other" } });
    const labelled = vi.mocked(db.postChannel.updateMany).mock.invocationCallOrder.at(-1)!;
    expect(vi.mocked(db.postChannel.deleteMany).mock.invocationCallOrder[0]).toBeGreaterThan(labelled);
  });

  it("removes only what has no history to keep: never a published post", async () => {
    await keepPublishedHistory([{ id: "c1", handle: "@shop" }]);
    expect(db.postChannel.deleteMany).toHaveBeenCalledWith({ where: { channelId: { in: ["c1"] }, status: { not: "published" } } });
  });

  it("does nothing for no channels", async () => {
    await keepPublishedHistory([]);
    expect(db.postChannel.updateMany).not.toHaveBeenCalled();
    expect(db.postChannel.deleteMany).not.toHaveBeenCalled();
  });
});
