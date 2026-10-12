import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { defaultSettings, serializeSettings } from "./prefs";

let pushOn = true;
const m = vi.hoisted(() => ({ pushMirror: vi.fn(), after: vi.fn() }));

vi.mock("@/lib/env", () => ({
  flags: {
    get webPush() {
      return pushOn;
    },
    realEmail: false,
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/email", () => ({ sendNotificationEmail: vi.fn() }));
vi.mock("@/lib/push/send", () => ({ pushMirror: m.pushMirror }));
vi.mock("next/server", () => ({ after: m.after }));
vi.mock("@/lib/db", () => ({
  db: {
    notificationPref: { findMany: vi.fn() },
    notification: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

import { createForUsers, createNotification } from "./service";

const base = { type: "publish_failed", title: "Publishing failed", body: "Could not publish", linkUrl: "/composer/p1", entityType: "post", entityId: "p1" };

beforeEach(() => {
  pushOn = true;
  m.pushMirror.mockReset().mockResolvedValue({ sent: 1, removed: 0, failed: 0 });
  m.after.mockReset().mockImplementation((fn: () => Promise<void>) => void fn());
  vi.mocked(db.notificationPref.findMany).mockReset().mockResolvedValue([] as never);
  vi.mocked(db.notification.create).mockReset().mockResolvedValue({ id: "n1" } as never);
  vi.mocked(db.notification.createMany).mockReset().mockResolvedValue({ count: 2 } as never);
  vi.mocked(db.notification.findMany).mockReset().mockResolvedValue([] as never);
});

const pushed = () => m.pushMirror.mock.calls[0] as [Array<Record<string, unknown>>, Map<string, unknown>];

describe("a new notification also goes out as a push", () => {
  it("createNotification hands the new notification to the push sender, with the person's settings", async () => {
    const r = await createNotification({ ...base, userId: "u1" });
    expect(r).toMatchObject({ created: true, id: "n1" });
    const [items, settings] = pushed();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ userId: "u1", type: "publish_failed", category: "publishing", priority: "high", linkUrl: "/composer/p1", notificationId: "n1" });
    expect(settings.get("u1")).toEqual(defaultSettings());
  });

  it("runs after the response where the platform allows it, so a slow push service never slows the person who triggered it", async () => {
    await createNotification({ ...base, userId: "u1" });
    expect(m.after).toHaveBeenCalledOnce();
  });

  it("runs inline where there is no request to run after (the publish worker, scripts)", async () => {
    m.after.mockImplementation(() => {
      throw new Error("after() was called outside a request scope");
    });
    await createNotification({ ...base, userId: "u1" });
    expect(m.pushMirror).toHaveBeenCalledOnce();
  });

  it("passes the person's saved preferences, not the defaults", async () => {
    const mine = defaultSettings();
    mine.push.minPriority = "critical";
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: true, emailPublish: true, emailApproval: true, emailMentions: true, settings: serializeSettings(mine) }] as never);
    await createNotification({ ...base, userId: "u1" });
    expect((pushed()[1].get("u1") as typeof mine).push.minPriority).toBe("critical");
  });

  it("noPush skips it", async () => {
    await createNotification({ ...base, userId: "u1", noPush: true });
    expect(m.pushMirror).not.toHaveBeenCalled();
  });

  it("nothing is pushed for a notification that was not created (switched off in-app, or a duplicate)", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: false, emailPublish: true, emailApproval: true, emailMentions: true, settings: null }] as never);
    await createNotification({ ...base, userId: "u1", type: "draft_reminder" });
    expect(m.pushMirror).not.toHaveBeenCalled();
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([] as never);
    const { Prisma } = await import("@prisma/client");
    vi.mocked(db.notification.create).mockRejectedValue(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }));
    expect(await createNotification({ ...base, userId: "u1", dedupeKey: "k" })).toMatchObject({ created: false, reason: "duplicate" });
    expect(m.pushMirror).not.toHaveBeenCalled();
  });

  it("does nothing, and costs nothing, when the server has no push keys", async () => {
    pushOn = false;
    await createNotification({ ...base, userId: "u1" });
    expect(m.pushMirror).not.toHaveBeenCalled();
    expect(m.after).not.toHaveBeenCalled();
  });

  it("a failing push can never fail the notification", async () => {
    m.pushMirror.mockRejectedValue(new Error("push service down"));
    m.after.mockImplementation(() => {
      throw new Error("outside request");
    });
    await expect(createNotification({ ...base, userId: "u1" })).resolves.toMatchObject({ created: true });
  });
});

describe("createForUsers pushes to the people who got the notification", () => {
  it("one batch for everyone whose in-app copy was created, each with their own settings", async () => {
    await createForUsers(["u1", "u2"], base);
    const [items, settings] = pushed();
    expect(items.map((i) => i.userId).sort()).toEqual(["u1", "u2"]);
    expect([...settings.keys()].sort()).toEqual(["u1", "u2"]);
  });

  it("skips people who already had it (de-duplicated) and people who switched in-app off", async () => {
    vi.mocked(db.notification.findMany).mockResolvedValue([{ userId: "u1" }] as never);
    await createForUsers(["u1", "u2"], { ...base, dedupeKey: "k1" });
    expect(pushed()[0].map((i) => i.userId)).toEqual(["u2"]);
  });

  it("noPush skips the batch", async () => {
    await createForUsers(["u1", "u2"], { ...base, noPush: true });
    expect(m.pushMirror).not.toHaveBeenCalled();
  });
});
