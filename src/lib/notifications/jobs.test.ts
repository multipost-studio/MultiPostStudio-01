import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  db: {
    post: { findMany: vi.fn(), count: vi.fn() },
    postMetric: { groupBy: vi.fn() },
    notificationPref: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    workspaceMember: { findMany: vi.fn() },
    conversation: { findMany: vi.fn() },
    message: { findFirst: vi.fn() },
    socialAccount: { findMany: vi.fn(), findUnique: vi.fn() },
    systemSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

const svc = vi.hoisted(() => ({ createNotification: vi.fn(), createForWorkspace: vi.fn() }));
vi.mock("./service", () => svc);

import { db } from "@/lib/db";
import {
  runNotificationJobs,
  sendCalendarGapReminders,
  sendDraftReminders,
  sendEngagementMilestones,
  sendInboxFollowups,
  sendMissedPostAlerts,
  sendPostingReminders,
  sendScheduledPostReminders,
} from "./reminders";
import { notifyAccountExpired, notifyAccountsExpiringSoon } from "./account-notify";
import { defaultSettings, serializeSettings } from "./prefs";

const NOW = new Date("2026-10-08T12:00:00Z");
const min = (n: number) => new Date(NOW.getTime() + n * 60_000);
const day = (n: number) => new Date(NOW.getTime() + n * 86_400_000);
const sent = () => svc.createNotification.mock.calls.map((c) => c[0] as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  svc.createNotification.mockResolvedValue({ created: true, id: "n" });
  svc.createForWorkspace.mockResolvedValue({ created: 1 });
  vi.mocked(db.notificationPref.findMany).mockResolvedValue([] as never);
  vi.mocked(db.post.findMany).mockResolvedValue([] as never);
  vi.mocked(db.post.count).mockResolvedValue(0 as never);
  vi.mocked(db.systemSetting.findUnique).mockResolvedValue(null as never);
  vi.mocked(db.systemSetting.upsert).mockResolvedValue({} as never);
});

const post = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  title: "Launch",
  scheduledAt: min(50),
  authorId: "u1",
  workspaceId: "w1",
  author: { timezone: "UTC" },
  channels: [{ platform: "instagram" }, { platform: "x" }],
  ...over,
});

describe("scheduled-post reminders", () => {
  it("reminds the author once, keyed on the post, its slot and the offset", async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([post()] as never);
    expect(await sendScheduledPostReminders(NOW)).toBe(1);
    expect(sent()[0]).toMatchObject({
      userId: "u1",
      workspaceId: "w1",
      type: "post_reminder",
      entityId: "p1",
      dedupeKey: `post_reminder:p1:${min(50).getTime()}:60`,
      linkUrl: "/composer/p1",
    });
    expect(String(sent()[0].body)).toContain("Instagram and X");
    expect(String(sent()[0].title)).toBe("Scheduled post in 50 minutes");
    expect((sent()[0].expiresAt as Date).getTime()).toBe(min(50).getTime());
  });

  it("re-running the tick produces the same key, so the service de-duplicates it", async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([post()] as never);
    await sendScheduledPostReminders(NOW);
    await sendScheduledPostReminders(new Date(NOW.getTime() + 60_000));
    expect(sent()[0].dedupeKey).toBe(sent()[1].dedupeKey);
  });

  it("a rescheduled post gets a fresh reminder (different slot, different key)", async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([post(), post({ scheduledAt: min(55) })] as never);
    await sendScheduledPostReminders(NOW);
    expect(sent()[0].dedupeKey).not.toBe(sent()[1].dedupeKey);
  });

  it("stays quiet outside the person's chosen windows", async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([post({ scheduledAt: min(300) })] as never);
    expect(await sendScheduledPostReminders(NOW)).toBe(0);
  });

  it("uses the closest of several chosen offsets, not all of them", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([
      { userId: "u1", settings: serializeSettings({ ...defaultSettings(), scheduledReminders: { enabled: true, offsets: [1440, 60, 15] } }) },
    ] as never);
    vi.mocked(db.post.findMany).mockResolvedValue([post({ scheduledAt: min(10) })] as never);
    await sendScheduledPostReminders(NOW);
    expect(sent()).toHaveLength(1);
    expect(String(sent()[0].dedupeKey)).toMatch(/:15$/);
  });

  it("honours the off switch", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([
      { userId: "u1", settings: serializeSettings({ ...defaultSettings(), scheduledReminders: { enabled: false, offsets: [60] } }) },
    ] as never);
    vi.mocked(db.post.findMany).mockResolvedValue([post()] as never);
    expect(await sendScheduledPostReminders(NOW)).toBe(0);
  });

  it("only considers posts that are really scheduled in the next 24 hours", async () => {
    await sendScheduledPostReminders(NOW);
    expect(vi.mocked(db.post.findMany).mock.calls[0][0]!.where).toMatchObject({ status: "scheduled", scheduledAt: { gt: NOW, lte: day(1) } });
  });
});

describe("missed posts", () => {
  it("flags a scheduled post that is long overdue with no job to publish it", async () => {
    const at = new Date(NOW.getTime() - 3 * 3_600_000);
    vi.mocked(db.post.findMany).mockResolvedValue([{ id: "p9", title: null, scheduledAt: at, authorId: "u1", workspaceId: "w1" }] as never);
    expect(await sendMissedPostAlerts(NOW)).toBe(1);
    expect(sent()[0]).toMatchObject({ type: "post_missed", actionLabel: "Reschedule", dedupeKey: `post_missed:p9:${at.getTime()}` });
    const where = vi.mocked(db.post.findMany).mock.calls[0][0]!.where as Record<string, unknown>;
    expect(where).toMatchObject({ status: "scheduled", publishJobs: { none: { status: { in: ["queued", "running"] } } } });
  });
});

describe("draft reminders", () => {
  it("sends one digest per author, only for drafts older than that author's wait", async () => {
    const old = (id: string, ageDays: number) => ({ id, title: id, updatedAt: day(-ageDays), authorId: "u1", workspaceId: "w1" });
    vi.mocked(db.post.findMany).mockResolvedValue([old("fresh", 2), old("a", 5), old("b", 9)] as never);
    expect(await sendDraftReminders(NOW)).toBe(1);
    expect(sent()[0]).toMatchObject({ type: "draft_reminder", title: "2 drafts are waiting for you", dedupeKey: "draft_reminder:u1:2026-W41" });
  });

  it("respects the off switch and the wait setting", async () => {
    const d = [{ id: "a", title: "a", updatedAt: day(-5), authorId: "u1", workspaceId: "w1" }];
    vi.mocked(db.post.findMany).mockResolvedValue(d as never);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", settings: serializeSettings({ ...defaultSettings(), draftReminders: { enabled: true, afterDays: 7 } }) }] as never);
    expect(await sendDraftReminders(NOW)).toBe(0);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", settings: serializeSettings({ ...defaultSettings(), draftReminders: { enabled: false, afterDays: 1 } }) }] as never);
    expect(await sendDraftReminders(NOW)).toBe(0);
  });
});

describe("opt-in nudges", () => {
  const optIn = (over: object) => ({ userId: "u1", settings: serializeSettings({ ...defaultSettings(), ...over }) });

  it("calendar gap: only for opted-in people, only in an otherwise active workspace, once a week", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([optIn({ calendarGap: { enabled: true, daysAhead: 3 } })] as never);
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ workspaceId: "w1" }] as never);
    vi.mocked(db.post.count).mockResolvedValueOnce(0 as never).mockResolvedValueOnce(4 as never); // nothing upcoming, 4 recent
    expect(await sendCalendarGapReminders(NOW)).toBe(1);
    expect(sent()[0]).toMatchObject({ type: "calendar_gap", dedupeKey: "calendar_gap:w1:u1:2026-W41" });
    expect(vi.mocked(db.notificationPref.findMany).mock.calls[0][0]!.where).toEqual({ settings: { contains: '"calendarGap":{"enabled":true' } });
  });

  it("calendar gap: stays quiet when something is scheduled, or the workspace has gone dormant", async () => {
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([optIn({ calendarGap: { enabled: true, daysAhead: 3 } })] as never);
    vi.mocked(db.workspaceMember.findMany).mockResolvedValue([{ workspaceId: "w1" }] as never);
    vi.mocked(db.post.count).mockResolvedValueOnce(2 as never).mockResolvedValueOnce(4 as never);
    expect(await sendCalendarGapReminders(NOW)).toBe(0);
    vi.mocked(db.post.count).mockResolvedValueOnce(0 as never).mockResolvedValueOnce(0 as never);
    expect(await sendCalendarGapReminders(NOW)).toBe(0);
  });

  describe("you haven't posted", () => {
    const person = (tz = "UTC") => [{ id: "u1", timezone: tz, createdAt: day(-60) }];

    it("sends after the chosen local hour when there has been no activity, once per period", async () => {
      vi.mocked(db.notificationPref.findMany).mockResolvedValue([optIn({ postingReminder: { enabled: true, afterDays: 3, hour: 9 } })] as never);
      vi.mocked(db.user.findMany).mockResolvedValue(person() as never);
      expect(await sendPostingReminders(NOW)).toBe(1); // 12:00 UTC is inside 09:00-15:00
      expect(sent()[0]).toMatchObject({ type: "posting_reminder", userId: "u1" });
      expect(String(sent()[0].dedupeKey)).toBe(`posting_reminder:u1:${Math.floor(NOW.getTime() / (3 * 86_400_000))}`);
    });

    it("waits for the person's own local hour", async () => {
      vi.mocked(db.notificationPref.findMany).mockResolvedValue([optIn({ postingReminder: { enabled: true, afterDays: 3, hour: 9 } })] as never);
      vi.mocked(db.user.findMany).mockResolvedValue(person("Asia/Tokyo") as never); // 21:00 there: past the 6-hour window
      expect(await sendPostingReminders(NOW)).toBe(0);
    });

    it("does not nag someone who posted recently or has a post scheduled, or who just signed up", async () => {
      vi.mocked(db.notificationPref.findMany).mockResolvedValue([optIn({ postingReminder: { enabled: true, afterDays: 3, hour: 9 } })] as never);
      vi.mocked(db.user.findMany).mockResolvedValue(person() as never);
      vi.mocked(db.post.count).mockResolvedValueOnce(1 as never).mockResolvedValueOnce(0 as never);
      expect(await sendPostingReminders(NOW)).toBe(0);
      vi.mocked(db.post.count).mockResolvedValueOnce(0 as never).mockResolvedValueOnce(2 as never);
      expect(await sendPostingReminders(NOW)).toBe(0);
      vi.mocked(db.user.findMany).mockResolvedValue([{ id: "u1", timezone: "UTC", createdAt: day(-1) }] as never);
      expect(await sendPostingReminders(NOW)).toBe(0);
    });
  });
});

describe("engagement milestones", () => {
  it("notifies the author once per post and threshold, using the latest reading per channel", async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([{ id: "p1", title: "Big one", authorId: "u1", workspaceId: "w1" }] as never);
    vi.mocked(db.postMetric.groupBy).mockResolvedValue([
      { postId: "p1", postChannelId: "c1", _max: { likes: 900, comments: 50, shares: 30, saves: 30 } },
      { postId: "p1", postChannelId: "c2", _max: { likes: 4000, comments: 100, shares: 50, saves: 50 } },
    ] as never);
    expect(await sendEngagementMilestones(NOW)).toBe(1);
    expect(sent()[0]).toMatchObject({ type: "engagement_milestone", title: "5,000 interactions", dedupeKey: "engagement_milestone:p1:5000", entityId: "p1" });
  });

  it("stays quiet below every threshold, or when switched off", async () => {
    vi.mocked(db.post.findMany).mockResolvedValue([{ id: "p1", title: "x", authorId: "u1", workspaceId: "w1" }] as never);
    vi.mocked(db.postMetric.groupBy).mockResolvedValue([{ postId: "p1", postChannelId: "c1", _max: { likes: 10, comments: 1, shares: 0, saves: 0 } }] as never);
    expect(await sendEngagementMilestones(NOW)).toBe(0);
    vi.mocked(db.postMetric.groupBy).mockResolvedValue([{ postId: "p1", postChannelId: "c1", _max: { likes: 99999, comments: 0, shares: 0, saves: 0 } }] as never);
    vi.mocked(db.notificationPref.findMany).mockResolvedValue([{ userId: "u1", settings: serializeSettings({ ...defaultSettings(), milestones: { enabled: false, thresholds: [1000] } }) }] as never);
    expect(await sendEngagementMilestones(NOW)).toBe(0);
  });
});

describe("inbox follow-ups", () => {
  it("sends one digest per assignee, counting only conversations where the customer spoke last", async () => {
    vi.mocked(db.conversation.findMany).mockResolvedValue([
      { id: "c1", assigneeId: "u1", workspaceId: "w1" },
      { id: "c2", assigneeId: "u1", workspaceId: "w1" },
      { id: "c3", assigneeId: "u1", workspaceId: "w1" },
    ] as never);
    vi.mocked(db.message.findFirst)
      .mockResolvedValueOnce({ direction: "inbound" } as never)
      .mockResolvedValueOnce({ direction: "outbound" } as never)
      .mockResolvedValueOnce({ direction: "inbound" } as never);
    expect(await sendInboxFollowups(NOW)).toBe(1);
    expect(sent()[0]).toMatchObject({ type: "inbox_followup", title: "2 conversations are waiting on you", dedupeKey: "inbox_followup:u1:2026-10-08" });
  });
});

describe("account notifications", () => {
  it("expired connection: tells the people who can reconnect, once a day per account", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ id: "a1", workspaceId: "w1", platform: "instagram", displayName: "Studio" } as never);
    await notifyAccountExpired("a1");
    expect(svc.createForWorkspace).toHaveBeenCalledWith(
      "w1",
      expect.objectContaining({ type: "account_expired", linkUrl: "/integrations", platform: "instagram", entityId: "a1", dedupeKey: expect.stringMatching(/^account_expired:a1:\d{4}-\d{2}-\d{2}$/) }),
      { roles: ["manager", "editor", "creator"] },
    );
  });

  it("never throws, even if the account vanished or the lookup fails", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(null as never);
    await expect(notifyAccountExpired("gone")).resolves.toBeUndefined();
    vi.mocked(db.socialAccount.findUnique).mockRejectedValue(new Error("db"));
    await expect(notifyAccountExpired("a1")).resolves.toBeUndefined();
  });

  it("expiring soon: only connections that cannot renew themselves, one reminder per expiry date", async () => {
    vi.mocked(db.socialAccount.findMany).mockResolvedValue([{ id: "a1", workspaceId: "w1", platform: "linkedin", displayName: "Co", tokenExpiresAt: day(3) }] as never);
    expect(await notifyAccountsExpiringSoon(NOW)).toBe(1);
    expect(vi.mocked(db.socialAccount.findMany).mock.calls[0][0]!.where).toMatchObject({ status: "connected", refreshToken: null });
    expect(svc.createForWorkspace.mock.calls[0][1]).toMatchObject({ type: "account_expiring", dedupeKey: `account_expiring:a1:${day(3).toISOString().slice(0, 10)}` });
    expect(String(svc.createForWorkspace.mock.calls[0][1].body)).toContain("3 days");
  });
});

describe("the tick entry point", () => {
  it("runs the time-critical parts every tick and the hourly parts at most once an hour", async () => {
    const first = await runNotificationJobs(NOW);
    expect(first.hourly).not.toBeNull();
    expect(db.systemSetting.upsert).toHaveBeenCalledOnce();

    vi.mocked(db.systemSetting.findUnique).mockResolvedValue({ value: JSON.stringify(NOW.toISOString()) } as never);
    const second = await runNotificationJobs(new Date(NOW.getTime() + 5 * 60_000));
    expect(second.hourly).toBeNull();

    const later = await runNotificationJobs(new Date(NOW.getTime() + 61 * 60_000));
    expect(later.hourly).not.toBeNull();
  });

  it("one failing part never stops the others or throws", async () => {
    vi.mocked(db.post.findMany).mockRejectedValue(new Error("db down"));
    const r = await runNotificationJobs(NOW);
    expect(r.reminders).toBe(0);
    expect(r.missed).toBe(0);
    expect(r.hourly).not.toBeNull();
  });
});
