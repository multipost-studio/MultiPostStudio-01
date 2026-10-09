import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ ctx: { user: { id: "u1", isImpersonated: false }, active: { workspace: { id: "w1" } } } as Record<string, unknown> }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn(async () => m.ctx) }));
vi.mock("@/lib/db", () => ({ db: { notificationPref: { upsert: vi.fn() } } }));

const svc = vi.hoisted(() => ({
  markAsRead: vi.fn(),
  markAsUnread: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  getUnreadCount: vi.fn(),
}));
vi.mock("@/lib/notifications/service", () => ({
  ...svc,
  isFilter: (v: unknown) => typeof v === "string" && ["all", "unread", "read", "mentions", "publishing", "scheduling", "engagement", "team", "account", "billing", "system"].includes(v),
}));

import { db } from "@/lib/db";
import {
  deleteNotificationAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
  markNotificationUnreadAction,
  saveNotificationPrefsAction,
} from "./notifications";

const flags = { emailPublish: true, emailApproval: true, emailMentions: false, emailWeeklyDigest: true, emailReports: true, inappAll: true };

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = { user: { id: "u1", isImpersonated: false }, active: { workspace: { id: "w1" } } };
  svc.markAsRead.mockResolvedValue(true);
  svc.markAsUnread.mockResolvedValue(true);
  svc.markAllAsRead.mockResolvedValue(3);
  svc.deleteNotification.mockResolvedValue(true);
  svc.getUnreadCount.mockResolvedValue(2);
  vi.mocked(db.notificationPref.upsert).mockResolvedValue({} as never);
});

describe("marking read", () => {
  it("always acts as the signed-in user, never as anyone the caller names", async () => {
    const r = await markNotificationReadAction("victim-notification-id");
    expect(svc.markAsRead).toHaveBeenCalledWith("u1", "victim-notification-id");
    expect(r).toEqual({ ok: true, unread: 2 });
  });

  it("rejects empty and oversized ids without touching the database", async () => {
    expect((await markNotificationReadAction("")).ok).toBe(false);
    expect((await markNotificationReadAction("x".repeat(200))).ok).toBe(false);
    expect((await deleteNotificationAction("")).ok).toBe(false);
    expect(svc.markAsRead).not.toHaveBeenCalled();
    expect(svc.deleteNotification).not.toHaveBeenCalled();
  });

  it("mark-all uses the person's own scope and ignores an invalid filter", async () => {
    await markAllNotificationsReadAction("publishing");
    expect(svc.markAllAsRead).toHaveBeenCalledWith({ userId: "u1", workspaceId: "w1", readOnly: false }, "publishing");
    await markAllNotificationsReadAction("'; DROP TABLE");
    expect(svc.markAllAsRead).toHaveBeenLastCalledWith(expect.anything(), "all");
  });

  it("unread and delete are scoped to the user as well", async () => {
    await markNotificationUnreadAction("n1");
    await deleteNotificationAction("n1");
    expect(svc.markAsUnread).toHaveBeenCalledWith("u1", "n1");
    expect(svc.deleteNotification).toHaveBeenCalledWith("u1", "n1");
  });

  it("an admin viewing as a customer cannot change the customer's read state", async () => {
    m.ctx = { user: { id: "u1", isImpersonated: true }, active: { workspace: { id: "w1" } } };
    expect((await markNotificationReadAction("n1")).ok).toBe(false);
    expect((await markAllNotificationsReadAction()).ok).toBe(false);
    expect((await deleteNotificationAction("n1")).ok).toBe(false);
    expect(svc.markAsRead).not.toHaveBeenCalled();
    expect(svc.markAllAsRead).not.toHaveBeenCalled();
    expect(svc.deleteNotification).not.toHaveBeenCalled();
  });
});

describe("saving preferences", () => {
  it("stores the switches and a normalised settings object for the signed-in user only", async () => {
    const r = await saveNotificationPrefsAction({
      ...flags,
      settings: { toasts: false, draftReminders: { enabled: true, afterDays: 9999 }, categories: { billing: false } },
    });
    expect(r.ok).toBe(true);
    const arg = vi.mocked(db.notificationPref.upsert).mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1" });
    expect(arg.create).toMatchObject({ userId: "u1", emailMentions: false, inappAll: true });
    const saved = JSON.parse(String(arg.update.settings));
    expect(saved.toasts).toBe(false);
    expect(saved.draftReminders.afterDays).toBe(30); // clamped, not trusted
    expect(saved.categories.billing).toBe(false);
    expect(saved.categories.publishing).toBe(true);
  });

  it("rejects malformed input", async () => {
    expect((await saveNotificationPrefsAction({ ...flags, inappAll: "yes" })).ok).toBe(false);
    expect((await saveNotificationPrefsAction(null)).ok).toBe(false);
    expect(db.notificationPref.upsert).not.toHaveBeenCalled();
  });

  it("cannot be used to inject another user id", async () => {
    await saveNotificationPrefsAction({ ...flags, userId: "someone-else", settings: {} });
    expect(vi.mocked(db.notificationPref.upsert).mock.calls[0][0].where).toEqual({ userId: "u1" });
    expect(JSON.stringify(vi.mocked(db.notificationPref.upsert).mock.calls[0][0].create)).not.toContain("someone-else");
  });

  it("is read-only while impersonating, and reports a database failure kindly", async () => {
    m.ctx = { user: { id: "u1", isImpersonated: true }, active: { workspace: { id: "w1" } } };
    expect((await saveNotificationPrefsAction({ ...flags, settings: {} })).ok).toBe(false);
    m.ctx = { user: { id: "u1", isImpersonated: false }, active: { workspace: { id: "w1" } } };
    vi.mocked(db.notificationPref.upsert).mockRejectedValue(new Error("db down"));
    const r = await saveNotificationPrefsAction({ ...flags, settings: {} });
    expect(r.ok).toBe(false);
    expect(r.message).not.toMatch(/db down/);
  });
});
