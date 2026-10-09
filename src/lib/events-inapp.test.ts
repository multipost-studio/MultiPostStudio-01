import { describe, it, expect, vi, beforeEach } from "vitest";
import { notify, notifyMentions, notifyWorkspace } from "./events";
import { db } from "@/lib/db";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ flags: { realEmail: false } }));
vi.mock("@/lib/adapters/email", () => ({ sendNotificationEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    notification: { create: vi.fn(), createMany: vi.fn(), findMany: vi.fn() },
    notificationPref: { findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}));

const n = { type: "publish_success", title: "Posted", body: "Your post went live" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.notification.create).mockResolvedValue({ id: "n1" } as never);
  vi.mocked(db.notification.createMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(db.notification.findMany).mockResolvedValue([] as never);
  vi.mocked(db.notificationPref.findMany).mockResolvedValue([] as never);
});

describe("in-app notification preference", () => {
  it("creates the bell entry by default, filed under the type's category and priority", async () => {
    const row = await notify({ userId: "u1", ...n });
    expect(row).toEqual({ id: "n1" });
    expect(db.notification.create).toHaveBeenCalledOnce();
    const data = vi.mocked(db.notification.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ userId: "u1", type: "publish_success", category: "publishing", priority: "normal", title: "Posted" });
  });

  it("creates nothing for a user who switched in-app notifications off", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: false, settings: null }] as never);
    const row = await notify({ userId: "u1", ...n });
    expect(row).toBeNull();
    expect(db.notification.create).not.toHaveBeenCalled();
  });

  it("a failed preference lookup never swallows the notification", async () => {
    vi.mocked(db.notificationPref.findMany).mockRejectedValue(new Error("db down"));
    const row = await notify({ userId: "u1", ...n });
    expect(row).toEqual({ id: "n1" });
  });

  it("a payment failure still arrives for someone who turned notifications off", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: false, settings: null }] as never);
    const row = await notify({ userId: "u1", type: "billing_payment_failed", title: "Payment failed", body: "Update your card" });
    expect(row).toEqual({ id: "n1" });
  });

  it("a switched-off category hides only that category", async () => {
    const settings = JSON.stringify({ categories: { scheduling: false } });
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: true, settings }] as never);
    expect(await notify({ userId: "u1", type: "post_reminder", title: "t", body: "b" })).toBeNull();
    expect(await notify({ userId: "u1", ...n })).toEqual({ id: "n1" });
  });

  it("workspace notifications skip only the opted-out members and the actor", async () => {
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ userId: "a" }, { userId: "b" }, { userId: "c" }] as never);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "b", inappAll: false, settings: null }] as never);
    await notifyWorkspace("w1", n, "c");
    const arg = vi.mocked(db.notification.createMany).mock.calls[0]?.[0];
    const data = (arg?.data ?? []) as { userId: string; workspaceId: string }[];
    expect(data.map((d) => d.userId)).toEqual(["a"]);
    expect(data[0].workspaceId).toBe("w1");
    expect(arg?.skipDuplicates).toBe(true);
  });

  it("writes nothing when every member opted out", async () => {
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ userId: "a" }] as never);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "a", inappAll: false, settings: null }] as never);
    await notifyWorkspace("w1", n);
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });
});

describe("mentions", () => {
  it("notifies each mentioned member once and returns who was told", async () => {
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([
      { user: { id: "me", name: "Sam Writer" } },
      { user: { id: "ana", name: "Ana Rivera" } },
      { user: { id: "bo", name: "Bo Chen" } },
    ] as never);
    const told = await notifyMentions({ workspaceId: "w1", text: "thanks @Ana and @sam writer!", authorId: "me", title: "t", body: "b", linkUrl: "/composer/p1", dedupeKey: "mention:comment:c1" });
    expect(told).toEqual(["ana"]);
    const data = vi.mocked(db.notification.create).mock.calls[0][0].data as Record<string, unknown>;
    expect(data).toMatchObject({ userId: "ana", type: "mention", category: "mentions", dedupeKey: "mention:comment:c1:ana", linkUrl: "/composer/p1" });
  });

  it("does nothing without an @, and survives a first name full of regex characters", async () => {
    expect(await notifyMentions({ workspaceId: "w1", text: "no mention", authorId: "me", title: "t", body: "b" })).toEqual([]);
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ user: { id: "x", name: "(Ana) Rivera" } }] as never);
    await expect(notifyMentions({ workspaceId: "w1", text: "hi @someone", authorId: "me", title: "t", body: "b" })).resolves.toEqual([]);
  });
});
