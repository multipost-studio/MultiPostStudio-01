import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const m = vi.hoisted(() => ({ flags: { realEmail: false } }));

vi.mock("@/lib/env", () => ({
  get flags() {
    return m.flags;
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/adapters/email", () => ({ sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("@/lib/db", () => ({
  db: {
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    notificationPref: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    membership: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { sendNotificationEmail } from "@/lib/adapters/email";
import {
  cleanupNotifications,
  createForOrgAdmins,
  createForUsers,
  createForWorkspace,
  createNotification,
  deleteNotification,
  getUnreadCount,
  listNotifications,
  markAllAsRead,
  markAsRead,
  markAsUnread,
  sanitizeMetadata,
  toDTO,
  visibleWhere,
} from "./service";

const base = { userId: "u1", type: "publish_failed", title: "Publishing failed", body: "Could not publish." };
const scope = { userId: "u1", workspaceId: "w1" };
const dup = () => new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "test" });

beforeEach(() => {
  vi.clearAllMocks();
  m.flags.realEmail = false;
  vi.mocked(db.notification.create).mockResolvedValue({ id: "n1" } as never);
  vi.mocked(db.notification.createMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.notification.findFirst).mockResolvedValue(null as never);
  vi.mocked(db.notification.findMany).mockResolvedValue([] as never);
  vi.mocked(db.notification.updateMany).mockResolvedValue({ count: 1 } as never);
  vi.mocked(db.notification.count).mockResolvedValue(0 as never);
  vi.mocked(db.notification.deleteMany).mockResolvedValue({ count: 0 } as never);
  vi.mocked(db.notificationPref.findMany).mockResolvedValue([] as never);
  vi.mocked(db.user.findMany).mockResolvedValue([{ id: "u1", email: "a@b.co", name: "Ana" }] as never);
});

const created = () => vi.mocked(db.notification.create).mock.calls[0][0].data as Record<string, unknown>;

describe("sanitizeMetadata", () => {
  it("drops secrets at any depth and bounds the size", () => {
    const json = sanitizeMetadata({ channels: [{ platform: "x", accessToken: "SECRET" }], password: "p", nested: { api_key: "k", ok: 1 } });
    expect(json).not.toMatch(/SECRET|password|api_key/i);
    expect(JSON.parse(json!)).toEqual({ channels: [{ platform: "x" }], nested: { ok: 1 } });
    expect(sanitizeMetadata({ blob: "x".repeat(5000) })).toBeNull();
    expect(sanitizeMetadata(null)).toBeNull();
  });
});

describe("createNotification", () => {
  it("fills the registered category and priority, and cleans the row", async () => {
    const r = await createNotification({ ...base, linkUrl: "https://evil.example/x", title: "  Spaced \n out  ", metadata: { count: 2, token: "nope" } });
    expect(r).toEqual({ created: true, id: "n1" });
    expect(created()).toMatchObject({ category: "publishing", priority: "high", linkUrl: null, title: "Spaced out" });
    expect(String(created().metadata)).not.toContain("nope");
  });

  it("accepts a caller-chosen priority and keeps an internal link", async () => {
    await createNotification({ ...base, priority: "critical", linkUrl: "/integrations", workspaceId: "w1" });
    expect(created()).toMatchObject({ priority: "critical", linkUrl: "/integrations", workspaceId: "w1" });
  });

  it("ignores an invalid category or priority passed from untyped code", async () => {
    await createNotification({ ...base, category: "bogus" as never, priority: "urgent" as never });
    expect(created()).toMatchObject({ category: "publishing", priority: "high" });
  });

  it("is idempotent: the same dedupe key a second time creates nothing and sends no email", async () => {
    m.flags.realEmail = true;
    vi.mocked(db.notification.create).mockRejectedValue(dup());
    const r = await createNotification({ ...base, dedupeKey: "publish:job1" });
    expect(r).toEqual({ created: false, id: null, reason: "duplicate" });
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it("never throws, whatever the database does", async () => {
    vi.mocked(db.notification.create).mockRejectedValue(new Error("connection reset"));
    await expect(createNotification(base)).resolves.toMatchObject({ created: false });
  });

  it("respects the master switch, but required alerts bypass it", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: false, settings: null }] as never);
    expect(await createNotification(base)).toMatchObject({ created: false, reason: "disabled" });
    expect(db.notification.create).not.toHaveBeenCalled();
    expect(await createNotification({ ...base, type: "security_password_changed" })).toMatchObject({ created: true });
  });

  describe("grouping", () => {
    const group = { windowMin: 60, merge: (count: number) => ({ title: `${count} posts failed`, body: "Reconnect", linkUrl: "/integrations", actionLabel: "Reconnect" }) };
    const grouped = { ...base, entityType: "publish_account", entityId: "w1:instagram", metadata: { x: 1 }, group };

    it("folds a repeat into the unread entry instead of adding another", async () => {
      vi.mocked(db.notification.findFirst).mockResolvedValue({ id: "old", metadata: JSON.stringify({ count: 2 }) } as never);
      const r = await createNotification(grouped);
      expect(r).toEqual({ created: false, id: "old", reason: "grouped" });
      expect(db.notification.create).not.toHaveBeenCalled();
      const upd = vi.mocked(db.notification.update).mock.calls[0][0];
      expect(upd.where).toEqual({ id: "old" });
      expect(upd.data).toMatchObject({ title: "3 posts failed", linkUrl: "/integrations", actionLabel: "Reconnect" });
      expect(JSON.parse(String(upd.data.metadata))).toMatchObject({ count: 3 });
    });

    it("only looks at unread entries for the same user, type and entity", async () => {
      await createNotification(grouped);
      const where = vi.mocked(db.notification.findFirst).mock.calls[0][0]!.where as Record<string, unknown>;
      expect(where).toMatchObject({ userId: "u1", type: "publish_failed", entityType: "publish_account", entityId: "w1:instagram", readAt: null });
      expect(db.notification.create).toHaveBeenCalledOnce();
    });
  });

  describe("email mirror", () => {
    beforeEach(() => {
      m.flags.realEmail = true;
    });

    it("sends for a type with an email switch that is on", async () => {
      await createNotification(base);
      expect(sendNotificationEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.co", title: "Publishing failed" }));
    });

    it("respects the person's email switch", async () => {
      vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: true, emailPublish: false, emailApproval: true, emailMentions: true, settings: null }] as never);
      await createNotification(base);
      expect(sendNotificationEmail).not.toHaveBeenCalled();
    });

    it("never emails reminders or other in-app-only types", async () => {
      await createNotification({ ...base, type: "draft_reminder" });
      await createNotification({ ...base, type: "post_reminder" });
      expect(sendNotificationEmail).not.toHaveBeenCalled();
    });

    it("always emails security and payment alerts", async () => {
      vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: false, emailPublish: false, emailApproval: false, emailMentions: false, settings: null }] as never);
      await createNotification({ ...base, type: "billing_payment_failed" });
      expect(sendNotificationEmail).toHaveBeenCalledOnce();
    });

    it("skips email when the caller says so", async () => {
      await createNotification({ ...base, noEmail: true });
      expect(sendNotificationEmail).not.toHaveBeenCalled();
    });

    it("emails someone who switched in-app off but kept email on", async () => {
      vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", inappAll: false, emailPublish: true, emailApproval: true, emailMentions: true, settings: null }] as never);
      await createNotification(base);
      expect(db.notification.create).not.toHaveBeenCalled();
      expect(sendNotificationEmail).toHaveBeenCalledOnce();
    });

    it("a failing mail provider does not fail the notification", async () => {
      vi.mocked(sendNotificationEmail).mockRejectedValueOnce(new Error("smtp down"));
      await expect(createNotification(base)).resolves.toMatchObject({ created: true });
    });
  });
});

describe("createForUsers / createForWorkspace / createForOrgAdmins", () => {
  it("creates one row per opted-in person in a single insert, skipping duplicates", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "b", inappAll: false, settings: null }] as never);
    const r = await createForUsers(["a", "b", "c", "a"], { type: "publish_success", title: "t", body: "b", workspaceId: "w1" });
    const arg = vi.mocked(db.notification.createMany).mock.calls[0][0]!;
    expect((arg.data as { userId: string }[]).map((d) => d.userId)).toEqual(["a", "c"]);
    expect(arg.skipDuplicates).toBe(true);
    expect(r.created).toBe(2);
  });

  it("does not re-create what a dedupe key already covers", async () => {
    vi.mocked(db.notification.findMany).mockResolvedValue([{ userId: "a" }] as never);
    await createForUsers(["a", "b"], { type: "billing_plan_changed", title: "t", body: "b", dedupeKey: "k" });
    const data = vi.mocked(db.notification.createMany).mock.calls[0][0]!.data as { userId: string }[];
    expect(data.map((d) => d.userId)).toEqual(["b"]);
  });

  it("does nothing for nobody", async () => {
    expect(await createForUsers([], { type: "system", title: "t", body: "b" })).toEqual({ created: 0 });
    expect(db.notification.createMany).not.toHaveBeenCalled();
  });

  it("swallows database errors", async () => {
    vi.mocked(db.notification.createMany).mockRejectedValue(new Error("boom"));
    await expect(createForUsers(["a"], { type: "system", title: "t", body: "b" })).resolves.toEqual({ created: 0 });
  });

  it("workspace fan-out honours the actor and role filter", async () => {
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ userId: "a" }, { userId: "actor" }] as never);
    await createForWorkspace("w1", { type: "account_expired", title: "t", body: "b" }, { exceptUserId: "actor", roles: ["manager", "editor"] });
    expect(vi.mocked(db.workspaceMember.findMany).mock.calls[0][0]).toMatchObject({ where: { workspaceId: "w1", role: { in: ["manager", "editor"] } } });
    const data = vi.mocked(db.notification.createMany).mock.calls[0][0]!.data as { userId: string; workspaceId: string }[];
    expect(data).toHaveLength(1);
    expect(data[0]).toMatchObject({ userId: "a", workspaceId: "w1" });
  });

  it("org-admin fan-out targets active owners and admins and carries no workspace", async () => {
    vi.mocked(db.membership.findMany).mockResolvedValue([{ userId: "o" }] as never);
    await createForOrgAdmins("org1", { type: "billing_payment_failed", title: "t", body: "b" });
    expect(vi.mocked(db.membership.findMany).mock.calls[0][0]).toMatchObject({ where: { orgId: "org1", status: "active", role: { in: ["owner", "admin"] } } });
    const data = vi.mocked(db.notification.createMany).mock.calls[0][0]!.data as { workspaceId: string | null }[];
    expect(data[0].workspaceId).toBeNull();
  });
});

describe("reading", () => {
  const whereOf = () => vi.mocked(db.notification.findMany).mock.calls[0][0]!.where as { userId: string; AND: Record<string, unknown>[] };

  it("always scopes to the user, the active workspace (plus account-wide rows) and unexpired rows", async () => {
    await listNotifications(scope);
    const w = whereOf();
    expect(w.userId).toBe("u1");
    expect(JSON.stringify(w.AND)).toContain('"workspaceId":null');
    expect(JSON.stringify(w.AND)).toContain('"workspaceId":"w1"');
    expect(JSON.stringify(w.AND)).toContain("expiresAt");
  });

  it("a user with no workspace only sees account-wide rows", () => {
    const w = visibleWhere({ userId: "u1", workspaceId: null });
    expect(JSON.stringify(w)).not.toContain('"workspaceId":"');
  });

  it("filters by tab", async () => {
    await listNotifications(scope, { filter: "unread" });
    expect(JSON.stringify(whereOf().AND)).toContain('"readAt":null');
    vi.mocked(db.notification.findMany).mockClear();
    await listNotifications(scope, { filter: "mentions" });
    expect(JSON.stringify(whereOf().AND)).toContain('"category":"mentions"');
  });

  it("pages with a cursor: asks for one extra row and returns a cursor that resumes after the last one", async () => {
    const mk = (i: number) => ({ id: `n${i}`, type: "system", category: "system", priority: "normal", title: "t", body: "b", linkUrl: null, actionLabel: null, platform: null, workspaceId: null, metadata: null, readAt: null, createdAt: new Date(2026, 9, 8, 12, 0, 10 - i) });
    vi.mocked(db.notification.findMany).mockResolvedValue([mk(0), mk(1), mk(2)] as never);
    const page = await listNotifications(scope, { limit: 2 });
    expect(vi.mocked(db.notification.findMany).mock.calls[0][0]!.take).toBe(3);
    expect(page.items.map((i) => i.id)).toEqual(["n0", "n1"]);
    expect(page.nextCursor).toBeTruthy();

    vi.mocked(db.notification.findMany).mockClear();
    await listNotifications(scope, { limit: 2, cursor: page.nextCursor });
    expect(JSON.stringify(whereOf().AND)).toContain('"lt"');
    expect(JSON.stringify(whereOf().AND)).toContain("n1");
  });

  it("ignores a malformed cursor and clamps the page size", async () => {
    await listNotifications(scope, { cursor: "%%%not-base64%%%", limit: 5000 });
    expect(vi.mocked(db.notification.findMany).mock.calls[0][0]!.take).toBe(51);
  });

  it("searches title and body", async () => {
    await listNotifications(scope, { q: "  launch  " });
    expect(JSON.stringify(whereOf().AND)).toContain('"contains":"launch"');
  });

  it("counts unread within the same scope", async () => {
    vi.mocked(db.notification.count).mockResolvedValue(7 as never);
    expect(await getUnreadCount(scope)).toBe(7);
    const w = vi.mocked(db.notification.count).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(w).toMatchObject({ userId: "u1", readAt: null });
  });

  it("re-checks links and actions on the way out", () => {
    const dto = toDTO({
      id: "n", type: "publish_failed", category: "publishing", priority: "high", title: "t", body: "b",
      linkUrl: "javascript:alert(1)", actionLabel: "Go", platform: "x", workspaceId: null,
      metadata: JSON.stringify({ count: 4, actions: [{ label: "OK", url: "/composer/1" }, { label: "Bad", url: "https://evil.example" }, { label: 5, url: "/x" }] }),
      readAt: null, createdAt: new Date("2026-10-08T10:00:00Z"),
    });
    expect(dto.linkUrl).toBeNull();
    expect(dto.actions).toEqual([{ label: "OK", url: "/composer/1" }]);
    expect(dto.count).toBe(4);
    expect(dto.readAt).toBeNull();
  });

  it("announcements keep an admin's https link; every other type drops it", () => {
    const row = (type: string) => ({
      id: "n", type, category: "system", priority: "normal", title: "t", body: "b", linkUrl: "https://blog.example.com/post",
      actionLabel: null, platform: null, workspaceId: null, metadata: null, readAt: null, createdAt: new Date(),
    });
    expect(toDTO(row("system")).linkUrl).toBe("https://blog.example.com/post");
    expect(toDTO(row("publish_failed")).linkUrl).toBeNull();
    expect(toDTO(row("support_update")).linkUrl).toBeNull();
  });

  it("survives corrupt metadata and unknown category/priority values", () => {
    const dto = toDTO({
      id: "n", type: "mention", category: "weird", priority: "weird", title: "t", body: "b", linkUrl: null, actionLabel: null,
      platform: null, workspaceId: null, metadata: "{not json", readAt: new Date("2026-10-08T10:00:00Z"), createdAt: new Date(),
    });
    expect(dto).toMatchObject({ category: "mentions", priority: "normal", count: 1, actions: [] });
    expect(dto.readAt).toBe("2026-10-08T10:00:00.000Z");
  });
});

describe("writing: other people's notifications are untouchable", () => {
  it("marks read only where the id AND the signed-in user match", async () => {
    await markAsRead("u1", "someone-elses-id");
    expect(vi.mocked(db.notification.updateMany).mock.calls[0][0]).toMatchObject({ where: { id: "someone-elses-id", userId: "u1", readAt: null } });
  });

  it("reports whether anything changed", async () => {
    vi.mocked(db.notification.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    expect(await markAsRead("u1", "x")).toBe(false);
    expect(await markAsRead("u1", "y")).toBe(true);
  });

  it("mark-unread and delete are user-scoped too", async () => {
    await markAsUnread("u1", "n1");
    expect(vi.mocked(db.notification.updateMany).mock.calls[0][0]).toMatchObject({ where: { id: "n1", userId: "u1" }, data: { readAt: null } });
    await deleteNotification("u1", "n1");
    expect(vi.mocked(db.notification.deleteMany).mock.calls[0][0]).toEqual({ where: { id: "n1", userId: "u1" } });
  });

  it("mark-all is limited to the user's visible scope and, for a tab, its category", async () => {
    await markAllAsRead(scope);
    const all = vi.mocked(db.notification.updateMany).mock.calls[0][0]!;
    expect(all.where).toMatchObject({ userId: "u1", readAt: null });
    expect(JSON.stringify(all.where)).toContain('"workspaceId":"w1"');

    vi.mocked(db.notification.updateMany).mockClear();
    await markAllAsRead(scope, "publishing");
    expect(vi.mocked(db.notification.updateMany).mock.calls[0][0]!.where).toMatchObject({ userId: "u1", category: "publishing", readAt: null });
  });
});

describe("retention", () => {
  it("removes expired reminders, old read notifications and very old unread ones", async () => {
    vi.mocked(db.notification.deleteMany)
      .mockResolvedValueOnce({ count: 3 } as never)
      .mockResolvedValueOnce({ count: 5 } as never)
      .mockResolvedValueOnce({ count: 1 } as never);
    const now = new Date("2026-10-08T00:00:00Z");
    expect(await cleanupNotifications(now)).toEqual({ expired: 3, read: 5, stale: 1 });
    const calls = vi.mocked(db.notification.deleteMany).mock.calls.map((c) => c[0]!.where as Record<string, unknown>);
    expect(calls[0]).toEqual({ expiresAt: { lt: now } });
    expect(calls[1]).toMatchObject({ readAt: { not: null }, createdAt: { lt: new Date("2026-08-09T00:00:00Z") } });
    expect(calls[2]).toEqual({ createdAt: { lt: new Date("2026-04-11T00:00:00Z") } });
  });
});
