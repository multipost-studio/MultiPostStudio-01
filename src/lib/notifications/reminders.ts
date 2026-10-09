import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createNotification } from "./service";
import { notifyAccountsExpiringSoon } from "./account-notify";
import { parseSettings, type NotificationSettings } from "./prefs";
import { joinPlatforms } from "./types";

/**
 * Time-based notifications, run from the same scheduled tick as publishing (see lib/scheduled-work.ts).
 *
 * Two cadences:
 *  - every tick: reminders before a scheduled post, and the "this never went out" check, because timing matters;
 *  - once an hour: drafts, calendar gaps, the opt-in "you have not posted" nudge, engagement milestones,
 *    connections about to expire and inbox follow-ups, because nobody needs those minute by minute.
 *
 * Nothing here can spam. Every notification carries a dedupe key built from the thing it is about (a post
 * and its slot, a week, a milestone), so running the tick twice, or a worker and a cron overlapping, creates
 * each notification once. Each part is isolated: one failing never stops the others.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const HOURLY_STAMP = "notifications_last_hourly";

/* ----------------------------------------------------------- pure helpers */

/** The reminder offset that applies right now: the smallest one the post is already inside. */
export function pickReminderOffset(remainingMin: number, offsets: number[]): number | null {
  if (remainingMin <= 0) return null;
  const inside = offsets.filter((o) => remainingMin <= o).sort((a, b) => a - b);
  return inside.length > 0 ? inside[0] : null;
}

export function humanizeMinutes(min: number): string {
  if (min < 1) return "less than a minute";
  if (min < 60) return `${Math.round(min)} minute${Math.round(min) === 1 ? "" : "s"}`;
  const h = Math.round(min / 60);
  return `${h} hour${h === 1 ? "" : "s"}`;
}

/** The user's wall-clock hour and date in their own timezone; an unknown timezone falls back to UTC. */
export function localParts(now: Date, timeZone: string): { hour: number; date: string } {
  const read = (tz: string) => {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" });
    const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
    return { hour: Number(p.hour) % 24, date: `${p.year}-${p.month}-${p.day}` };
  };
  try {
    return read(timeZone || "UTC");
  } catch {
    return read("UTC");
  }
}

export function isoWeekKey(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** The highest threshold the value has reached, or null. */
export function highestThreshold(value: number, thresholds: number[]): number | null {
  const hit = thresholds.filter((t) => value >= t).sort((a, b) => b - a);
  return hit.length > 0 ? hit[0] : null;
}

function timeLabel(d: Date, timeZone: string): string {
  const opts: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
  try {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone }).format(d);
  } catch {
    return new Intl.DateTimeFormat("en-GB", { ...opts, timeZone: "UTC" }).format(d) + " UTC";
  }
}

async function settingsFor(userIds: string[]): Promise<Map<string, NotificationSettings>> {
  const out = new Map<string, NotificationSettings>();
  const defaults = parseSettings(null);
  userIds.forEach((id) => out.set(id, defaults));
  if (userIds.length === 0) return out;
  const rows = await db.notificationPref.findMany({ where: { userId: { in: userIds } }, select: { userId: true, settings: true } });
  for (const r of rows) out.set(r.userId, parseSettings(r.settings));
  return out;
}

/* ------------------------------------------------------- every-tick parts */

/** "Your post goes out in 1 hour": one reminder per post, slot and person, at the closest offset they chose. */
export async function sendScheduledPostReminders(now = new Date()): Promise<number> {
  const posts = await db.post.findMany({
    where: { status: "scheduled", scheduledAt: { gt: now, lte: new Date(now.getTime() + DAY) } },
    select: {
      id: true,
      title: true,
      scheduledAt: true,
      authorId: true,
      workspaceId: true,
      author: { select: { timezone: true } },
      channels: { select: { platform: true } },
    },
    orderBy: { scheduledAt: "asc" },
    take: 500,
  });
  if (posts.length === 0) return 0;
  const settings = await settingsFor([...new Set(posts.map((p) => p.authorId))]);
  let sent = 0;
  for (const p of posts) {
    const s = settings.get(p.authorId)!.scheduledReminders;
    if (!s.enabled || !p.scheduledAt) continue;
    const remaining = (p.scheduledAt.getTime() - now.getTime()) / MIN;
    const offset = pickReminderOffset(remaining, s.offsets);
    if (offset === null) continue;
    const name = p.title?.trim() || "Untitled post";
    const where = joinPlatforms(p.channels.map((c) => c.platform));
    const r = await createNotification({
      userId: p.authorId,
      workspaceId: p.workspaceId,
      type: "post_reminder",
      title: `Scheduled post in ${humanizeMinutes(remaining)}`,
      body: `"${name.slice(0, 70)}" goes out${where ? ` on ${where}` : ""} at ${timeLabel(p.scheduledAt, p.author.timezone)}.`,
      linkUrl: `/composer/${p.id}`,
      actionLabel: "Review post",
      entityType: "post",
      entityId: p.id,
      dedupeKey: `post_reminder:${p.id}:${p.scheduledAt.getTime()}:${offset}`,
      expiresAt: p.scheduledAt,
    });
    if (r.created) sent++;
  }
  return sent;
}

/**
 * A post still marked "scheduled" more than 20 minutes past its slot with nothing queued or running to
 * publish it: it is not going to go out by itself. Posts that failed are already reported by the queue.
 */
export async function sendMissedPostAlerts(now = new Date()): Promise<number> {
  const posts = await db.post.findMany({
    where: {
      status: "scheduled",
      scheduledAt: { lt: new Date(now.getTime() - 20 * MIN), gt: new Date(now.getTime() - 7 * DAY) },
      publishJobs: { none: { status: { in: ["queued", "running"] } } },
    },
    select: { id: true, title: true, scheduledAt: true, authorId: true, workspaceId: true },
    take: 200,
  });
  let sent = 0;
  for (const p of posts) {
    if (!p.scheduledAt) continue;
    const r = await createNotification({
      userId: p.authorId,
      workspaceId: p.workspaceId,
      type: "post_missed",
      title: "A scheduled post didn't go out",
      body: `"${(p.title?.trim() || "Untitled post").slice(0, 70)}" was due earlier and wasn't published. Reschedule it or publish it now.`,
      linkUrl: `/composer/${p.id}`,
      actionLabel: "Reschedule",
      entityType: "post",
      entityId: p.id,
      dedupeKey: `post_missed:${p.id}:${p.scheduledAt.getTime()}`,
    });
    if (r.created) sent++;
  }
  return sent;
}

/* --------------------------------------------------------- hourly parts */

/** One digest per author per week: "3 drafts are waiting". Respects each person's own wait time. */
export async function sendDraftReminders(now = new Date()): Promise<number> {
  const drafts = await db.post.findMany({
    where: { status: "draft", archivedAt: null, updatedAt: { lt: new Date(now.getTime() - DAY), gt: new Date(now.getTime() - 60 * DAY) } },
    select: { id: true, title: true, updatedAt: true, authorId: true, workspaceId: true },
    orderBy: { updatedAt: "desc" },
    take: 2000,
  });
  const byAuthor = new Map<string, typeof drafts>();
  for (const d of drafts) byAuthor.set(d.authorId, [...(byAuthor.get(d.authorId) ?? []), d]);
  const authors = [...byAuthor.keys()].slice(0, 500);
  const settings = await settingsFor(authors);
  let sent = 0;
  for (const authorId of authors) {
    const s = settings.get(authorId)!.draftReminders;
    if (!s.enabled) continue;
    const waiting = (byAuthor.get(authorId) ?? []).filter((d) => d.updatedAt.getTime() < now.getTime() - s.afterDays * DAY);
    if (waiting.length === 0) continue;
    const newest = waiting[0];
    const r = await createNotification({
      userId: authorId,
      workspaceId: newest.workspaceId,
      type: "draft_reminder",
      title: waiting.length === 1 ? "A draft is waiting for you" : `${waiting.length} drafts are waiting for you`,
      body:
        waiting.length === 1
          ? `"${(newest.title?.trim() || "Untitled post").slice(0, 70)}" hasn't been touched in ${s.afterDays}+ days. Finish it or schedule it.`
          : `They haven't been touched in ${s.afterDays}+ days. Pick one to finish and schedule.`,
      linkUrl: `/composer/${newest.id}`,
      actionLabel: "Open draft",
      entityType: "post",
      entityId: newest.id,
      dedupeKey: `draft_reminder:${authorId}:${isoWeekKey(now)}`,
      expiresAt: new Date(now.getTime() + 14 * DAY),
    });
    if (r.created) sent++;
  }
  return sent;
}

async function optedIn(flag: "calendarGap" | "postingReminder"): Promise<{ userId: string; settings: NotificationSettings }[]> {
  const rows = await db.notificationPref.findMany({
    where: { settings: { contains: `"${flag}":{"enabled":true` } },
    select: { userId: true, settings: true },
    take: 2000,
  });
  return rows.map((r) => ({ userId: r.userId, settings: parseSettings(r.settings) })).filter((r) => r.settings[flag].enabled);
}

/** Opt-in: nothing scheduled for the next few days in a workspace that is otherwise active. */
export async function sendCalendarGapReminders(now = new Date()): Promise<number> {
  const users = await optedIn("calendarGap");
  let sent = 0;
  for (const { userId, settings } of users) {
    const members = await db.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true }, take: 3 });
    for (const m of members) {
      const ahead = new Date(now.getTime() + settings.calendarGap.daysAhead * DAY);
      const [upcoming, recent] = await Promise.all([
        db.post.count({ where: { workspaceId: m.workspaceId, status: { in: ["scheduled", "approved", "awaiting_approval"] }, scheduledAt: { gt: now, lte: ahead } } }),
        db.post.count({ where: { workspaceId: m.workspaceId, status: "published", publishedAt: { gt: new Date(now.getTime() - 30 * DAY) } } }),
      ]);
      if (upcoming > 0 || recent === 0) continue;
      const r = await createNotification({
        userId,
        workspaceId: m.workspaceId,
        type: "calendar_gap",
        title: `Nothing scheduled for the next ${settings.calendarGap.daysAhead} days`,
        body: "Your calendar has a gap. Schedule a post so your audience keeps hearing from you.",
        linkUrl: "/calendar",
        actionLabel: "Open calendar",
        entityType: "workspace",
        entityId: m.workspaceId,
        dedupeKey: `calendar_gap:${m.workspaceId}:${userId}:${isoWeekKey(now)}`,
        expiresAt: new Date(now.getTime() + 7 * DAY),
      });
      if (r.created) sent++;
    }
  }
  return sent;
}

/**
 * Opt-in "you haven't posted in N days", sent at the first run after the person's chosen local hour (never
 * later than six hours after it) and at most once per N-day period.
 */
export async function sendPostingReminders(now = new Date()): Promise<number> {
  const users = await optedIn("postingReminder");
  if (users.length === 0) return 0;
  const people = await db.user.findMany({
    where: { id: { in: users.map((u) => u.userId) }, deletedAt: null },
    select: { id: true, timezone: true, createdAt: true },
  });
  const byId = new Map(people.map((p) => [p.id, p]));
  let sent = 0;
  for (const { userId, settings } of users) {
    const u = byId.get(userId);
    if (!u) continue;
    const cfg = settings.postingReminder;
    const { hour } = localParts(now, u.timezone);
    if (hour < cfg.hour || hour >= cfg.hour + 6) continue;
    const since = new Date(now.getTime() - cfg.afterDays * DAY);
    if (u.createdAt > since) continue; // new accounts get the onboarding flow, not a nag
    const [recent, upcoming] = await Promise.all([
      db.post.count({ where: { authorId: userId, OR: [{ publishedAt: { gt: since } }, { createdAt: { gt: since } }] } }),
      db.post.count({ where: { authorId: userId, status: "scheduled", scheduledAt: { gt: now } } }),
    ]);
    if (recent > 0 || upcoming > 0) continue;
    const r = await createNotification({
      userId,
      type: "posting_reminder",
      title: `You haven't posted in ${cfg.afterDays} days`,
      body: "A quick post keeps your audience warm. Start from an idea or a draft.",
      linkUrl: "/composer",
      actionLabel: "Create a post",
      entityType: "user",
      entityId: userId,
      dedupeKey: `posting_reminder:${userId}:${Math.floor(now.getTime() / (cfg.afterDays * DAY))}`,
      expiresAt: new Date(now.getTime() + 2 * DAY),
    });
    if (r.created) sent++;
  }
  return sent;
}

/**
 * A post's total interactions (likes + comments + shares + saves, taking the latest cumulative reading per
 * channel) crossing a threshold the author picked. Sent to the author once per post and threshold.
 */
export async function sendEngagementMilestones(now = new Date()): Promise<number> {
  const posts = await db.post.findMany({
    where: { status: "published", publishedAt: { gt: new Date(now.getTime() - 30 * DAY) } },
    select: { id: true, title: true, authorId: true, workspaceId: true },
    take: 500,
  });
  if (posts.length === 0) return 0;
  const grouped = await db.postMetric.groupBy({
    by: ["postId", "postChannelId"],
    where: { postId: { in: posts.map((p) => p.id) } },
    _max: { likes: true, comments: true, shares: true, saves: true },
  });
  const totals = new Map<string, number>();
  for (const g of grouped) {
    const sum = (g._max.likes ?? 0) + (g._max.comments ?? 0) + (g._max.shares ?? 0) + (g._max.saves ?? 0);
    totals.set(g.postId, (totals.get(g.postId) ?? 0) + sum);
  }
  const settings = await settingsFor([...new Set(posts.map((p) => p.authorId))]);
  let sent = 0;
  for (const p of posts) {
    const s = settings.get(p.authorId)!.milestones;
    if (!s.enabled) continue;
    const reached = highestThreshold(totals.get(p.id) ?? 0, s.thresholds);
    if (reached === null) continue;
    const r = await createNotification({
      userId: p.authorId,
      workspaceId: p.workspaceId,
      type: "engagement_milestone",
      title: `${reached.toLocaleString("en-US")} interactions`,
      body: `"${(p.title?.trim() || "Untitled post").slice(0, 70)}" passed ${reached.toLocaleString("en-US")} likes, comments, shares and saves.`,
      linkUrl: "/analytics/content",
      actionLabel: "See performance",
      entityType: "post",
      entityId: p.id,
      dedupeKey: `engagement_milestone:${p.id}:${reached}`,
    });
    if (r.created) sent++;
  }
  return sent;
}

/** One digest per assignee per day for conversations that have waited on them more than a day. */
export async function sendInboxFollowups(now = new Date()): Promise<number> {
  const waiting = await db.conversation.findMany({
    where: { status: "open", assigneeId: { not: null }, lastMessageAt: { lt: new Date(now.getTime() - DAY), gt: new Date(now.getTime() - 14 * DAY) } },
    select: { id: true, assigneeId: true, workspaceId: true },
    orderBy: { lastMessageAt: "asc" },
    take: 200,
  });
  const mine = new Map<string, { workspaceId: string; ids: string[] }>();
  for (const c of waiting) {
    // Waiting means the customer spoke last. If staff replied or left a note, it is not a follow-up.
    const last = await db.message.findFirst({ where: { conversationId: c.id }, orderBy: { createdAt: "desc" }, select: { direction: true } });
    if (last && last.direction !== "inbound") continue;
    const key = c.assigneeId as string;
    const cur = mine.get(key) ?? { workspaceId: c.workspaceId, ids: [] };
    mine.set(key, { workspaceId: cur.workspaceId, ids: [...cur.ids, c.id] });
  }
  const settings = await settingsFor([...mine.keys()]);
  let sent = 0;
  for (const [userId, v] of mine) {
    if (!settings.get(userId)?.inboxFollowups) continue;
    const r = await createNotification({
      userId,
      workspaceId: v.workspaceId,
      type: "inbox_followup",
      title: v.ids.length === 1 ? "A conversation is waiting on you" : `${v.ids.length} conversations are waiting on you`,
      body: "They were assigned to you and haven't had a reply in over a day.",
      linkUrl: "/inbox",
      actionLabel: "Open inbox",
      entityType: "workspace",
      entityId: v.workspaceId,
      metadata: { count: v.ids.length },
      dedupeKey: `inbox_followup:${userId}:${now.toISOString().slice(0, 10)}`,
      expiresAt: new Date(now.getTime() + 2 * DAY),
    });
    if (r.created) sent++;
  }
  return sent;
}

/* --------------------------------------------------------------- the tick */

export type NotificationJobResult = {
  reminders: number;
  missed: number;
  hourly: null | { drafts: number; gaps: number; posting: number; milestones: number; expiring: number; followups: number };
};

async function safe<T>(label: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    logger.warn({ err }, `notification job failed: ${label}`);
    return fallback;
  }
}

/** The tick entry point. Cheap on most ticks; never throws. */
export async function runNotificationJobs(now = new Date()): Promise<NotificationJobResult> {
  const reminders = await safe("reminders", () => sendScheduledPostReminders(now), 0);
  const missed = await safe("missed", () => sendMissedPostAlerts(now), 0);

  const stamp = await db.systemSetting.findUnique({ where: { key: HOURLY_STAMP }, select: { value: true } }).catch(() => null);
  let last = 0;
  try {
    last = stamp ? Date.parse(JSON.parse(stamp.value) as string) : 0;
  } catch {
    last = 0;
  }
  if (Number.isFinite(last) && now.getTime() - last < HOUR) return { reminders, missed, hourly: null };
  await db.systemSetting
    .upsert({
      where: { key: HOURLY_STAMP },
      create: { key: HOURLY_STAMP, value: JSON.stringify(now.toISOString()) },
      update: { value: JSON.stringify(now.toISOString()) },
    })
    .catch((err) => logger.warn({ err }, "notification jobs: stamp failed"));

  return {
    reminders,
    missed,
    hourly: {
      drafts: await safe("drafts", () => sendDraftReminders(now), 0),
      gaps: await safe("gaps", () => sendCalendarGapReminders(now), 0),
      posting: await safe("posting", () => sendPostingReminders(now), 0),
      milestones: await safe("milestones", () => sendEngagementMilestones(now), 0),
      expiring: await safe("expiring", () => notifyAccountsExpiringSoon(now), 0),
      followups: await safe("followups", () => sendInboxFollowups(now), 0),
    },
  };
}
