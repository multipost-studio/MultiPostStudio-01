import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { MAX_PUSH_DEVICES, registerSubscription } from "./store";

vi.mock("@/lib/db", () => ({
  db: { pushSubscription: { upsert: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() } },
}));

const sub = { endpoint: "https://fcm.googleapis.com/x", p256dh: "k", auth: "a" };
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";

beforeEach(() => {
  vi.mocked(db.pushSubscription.upsert).mockReset().mockResolvedValue({ id: "row" } as never);
  vi.mocked(db.pushSubscription.findMany).mockReset().mockResolvedValue([{ id: "row" }] as never);
  vi.mocked(db.pushSubscription.deleteMany).mockReset().mockResolvedValue({ count: 0 } as never);
});

describe("registerSubscription", () => {
  it("stores the device under the user with a label made from the browser", async () => {
    await registerSubscription("u1", sub, ANDROID);
    const arg = vi.mocked(db.pushSubscription.upsert).mock.calls[0][0];
    expect(arg.where).toEqual({ endpoint: sub.endpoint });
    expect(arg.create).toMatchObject({ userId: "u1", endpoint: sub.endpoint, label: "Chrome on Android" });
  });

  it("an endpoint that was subscribed under another account moves to whoever signed in last", async () => {
    await registerSubscription("u2", sub, ANDROID);
    expect(vi.mocked(db.pushSubscription.upsert).mock.calls[0][0].update).toMatchObject({ userId: "u2", failureCount: 0 });
  });

  it("uses a custom label when one is given, trimmed and shortened", async () => {
    await registerSubscription("u1", sub, ANDROID, "   My   work   phone   ");
    expect(vi.mocked(db.pushSubscription.upsert).mock.calls[0][0].create).toMatchObject({ label: "My work phone" });
    await registerSubscription("u1", sub, ANDROID, "x".repeat(200));
    expect((vi.mocked(db.pushSubscription.upsert).mock.calls[1][0].create as { label: string }).label.length).toBe(60);
  });

  it("keeps at most the allowed number of devices, dropping the least recently used", async () => {
    const rows = Array.from({ length: MAX_PUSH_DEVICES + 2 }, (_, i) => ({ id: `r${i}` }));
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue(rows as never);
    await registerSubscription("u1", sub, ANDROID);
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [`r${MAX_PUSH_DEVICES}`, `r${MAX_PUSH_DEVICES + 1}`] }, userId: "u1" } });
  });

  it("deletes nothing while under the limit", async () => {
    await registerSubscription("u1", sub, ANDROID);
    expect(db.pushSubscription.deleteMany).not.toHaveBeenCalled();
  });
});
