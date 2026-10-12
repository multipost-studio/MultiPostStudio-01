import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { defaultSettings } from "@/lib/notifications/prefs";
import type { PushItem } from "./send";

const wp = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn() }));

vi.mock("web-push", () => ({ default: wp }));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  env: { VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", VAPID_SUBJECT: "mailto:ops@example.com" },
  flags: { webPush: true },
  appUrl: () => "https://app.example.com",
}));
vi.mock("@/lib/db", () => ({
  db: {
    pushSubscription: { findMany: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
    user: { findMany: vi.fn() },
    notification: { groupBy: vi.fn(), count: vi.fn() },
  },
}));

import { pushMirror, sendTestPush } from "./send";

const item = (over: Partial<PushItem> = {}): PushItem => ({
  userId: "u1",
  type: "publish_failed",
  category: "publishing",
  priority: "high",
  title: "Publishing failed",
  body: '"Launch" could not be published.',
  linkUrl: "/composer/p1",
  entityId: "p1",
  notificationId: "n1",
  ...over,
});
const sub = (id: string, userId = "u1", failureCount = 0) => ({ id, userId, endpoint: `https://fcm.googleapis.com/${id}`, p256dh: "k", auth: "a", failureCount });
const settings = (id = "u1") => new Map([[id, defaultSettings()]]);

beforeEach(() => {
  wp.setVapidDetails.mockReset();
  wp.sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  vi.mocked(db.pushSubscription.findMany).mockReset().mockResolvedValue([sub("s1")] as never);
  vi.mocked(db.pushSubscription.update).mockReset().mockResolvedValue({} as never);
  vi.mocked(db.pushSubscription.deleteMany).mockReset().mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.user.findMany).mockReset().mockResolvedValue([{ id: "u1", timezone: "UTC" }] as never);
  vi.mocked(db.notification.groupBy).mockReset().mockResolvedValue([{ userId: "u1", _count: { _all: 3 } }] as never);
  vi.mocked(db.notification.count).mockReset().mockResolvedValue(2);
});

describe("pushMirror", () => {
  it("sends an encrypted push to each of the person's devices with the notification text, link and unread count", async () => {
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([sub("s1"), sub("s2")] as never);
    const out = await pushMirror([item()], settings());
    expect(out).toEqual({ sent: 2, removed: 0, failed: 0 });
    expect(wp.sendNotification).toHaveBeenCalledTimes(2);
    const [target, body, opts] = wp.sendNotification.mock.calls[0];
    expect(target).toMatchObject({ endpoint: "https://fcm.googleapis.com/s1", keys: { p256dh: "k", auth: "a" } });
    expect(JSON.parse(body)).toMatchObject({ title: "Publishing failed", url: "/composer/p1", tag: "publish_failed:p1", id: "n1", priority: "high", badge: 3 });
    expect(opts).toMatchObject({ urgency: "high", TTL: 24 * 3600, timeout: 6000 });
    expect(wp.setVapidDetails).toHaveBeenCalledWith("mailto:ops@example.com", "pub", "priv");
  });

  it("applies the person's own rules: nothing is sent when their settings say no", async () => {
    const off = defaultSettings();
    off.push.enabled = false;
    expect((await pushMirror([item()], new Map([["u1", off]]))).sent).toBe(0);
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });

  it("skips people with no devices without doing any sending", async () => {
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([] as never);
    expect(await pushMirror([item()], settings())).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(wp.sendNotification).not.toHaveBeenCalled();
  });

  it("skips a deleted or suspended person (they are not in the user lookup)", async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([] as never);
    expect((await pushMirror([item()], settings())).sent).toBe(0);
  });

  it("removes a device the push service says is gone (404 or 410) and keeps the others", async () => {
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([sub("gone"), sub("ok")] as never);
    wp.sendNotification.mockImplementation(async (t: { endpoint: string }) => {
      if (t.endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      return { statusCode: 201 };
    });
    const out = await pushMirror([item()], settings());
    expect(out).toEqual({ sent: 1, removed: 1, failed: 0 });
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "gone" } });
  });

  it("counts a transient failure against the device, and drops it after too many in a row", async () => {
    wp.sendNotification.mockRejectedValue(Object.assign(new Error("boom"), { statusCode: 503 }));
    expect((await pushMirror([item()], settings())).failed).toBe(1);
    expect(db.pushSubscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: { failureCount: { increment: 1 } } });
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([sub("s1", "u1", 7)] as never);
    expect((await pushMirror([item()], settings())).removed).toBe(1);
    expect(db.pushSubscription.deleteMany).toHaveBeenCalledWith({ where: { id: "s1" } });
  });

  it("resets the failure count and records the delivery when a push succeeds", async () => {
    await pushMirror([item()], settings());
    expect(db.pushSubscription.update).toHaveBeenCalledWith({ where: { id: "s1" }, data: expect.objectContaining({ failureCount: 0 }) });
  });

  it("never throws: a database or library failure is swallowed and reported as nothing sent", async () => {
    vi.mocked(db.pushSubscription.findMany).mockRejectedValue(new Error("db down"));
    await expect(pushMirror([item()], settings())).resolves.toEqual({ sent: 0, removed: 0, failed: 0 });
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([sub("s1")] as never);
    wp.sendNotification.mockRejectedValue(new Error("no status at all"));
    await expect(pushMirror([item()], settings())).resolves.toBeDefined();
  });

  it("sends one push per notification per device when several arrive together", async () => {
    const out = await pushMirror([item({ entityId: "p1" }), item({ entityId: "p2", title: "Second" })], settings());
    expect(out.sent).toBe(2);
    const tags = wp.sendNotification.mock.calls.map((c) => JSON.parse(c[1]).tag).sort();
    expect(tags).toEqual(["publish_failed:p1", "publish_failed:p2"]);
  });

  it("does nothing for an empty batch", async () => {
    expect(await pushMirror([], settings())).toEqual({ sent: 0, removed: 0, failed: 0 });
    expect(db.pushSubscription.findMany).not.toHaveBeenCalled();
  });
});

describe("sendTestPush", () => {
  it("sends to every device the person has, ignoring their filters", async () => {
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([sub("s1"), sub("s2")] as never);
    const r = await sendTestPush("u1");
    expect(r).toEqual({ ok: true, sent: 2, devices: 2 });
    expect(JSON.parse(wp.sendNotification.mock.calls[0][1])).toMatchObject({ title: "Notifications are on", url: "/settings/notifications", badge: 2 });
  });

  it("says so when there is no device, and when delivery fails everywhere", async () => {
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([] as never);
    expect(await sendTestPush("u1")).toMatchObject({ ok: false, reason: "no-devices" });
    vi.mocked(db.pushSubscription.findMany).mockResolvedValue([sub("s1")] as never);
    wp.sendNotification.mockRejectedValue(Object.assign(new Error("x"), { statusCode: 500 }));
    expect(await sendTestPush("u1")).toMatchObject({ ok: false, sent: 0, devices: 1, reason: "delivery-failed" });
  });
});
