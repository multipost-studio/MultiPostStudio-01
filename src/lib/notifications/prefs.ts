import { CATEGORIES, PRIORITIES, categoryOf, isRequiredType, type NotificationCategory, type NotificationPriority } from "./types";

/**
 * Per-user notification settings, stored as JSON in NotificationPref.settings. The older boolean columns
 * (emailPublish, emailApproval, emailMentions, inappAll, ...) stay as they are and keep their meaning;
 * this adds what they cannot express: per-category in-app switches, reminder timing and milestone options.
 *
 * Parsing is deliberately forgiving. A missing, empty or corrupted value yields the defaults, and every
 * number is clamped, so a bad row can never stop a notification from being created.
 */

export const REMINDER_OFFSETS = [1440, 60, 15] as const; // minutes before a scheduled post: 24h, 1h, 15m
export const MILESTONE_CHOICES = [100, 500, 1000, 5000, 10000, 50000] as const;

export type NotificationSettings = {
  /** In-app delivery per category. Required types ignore a `false` here. */
  categories: Record<NotificationCategory, boolean>;
  /** Show a short toast when a new notification arrives while the app is open. */
  toasts: boolean;
  /** "Post published" confirmations. Off keeps the noise down while failures, which matter, still arrive. */
  publishSuccess: boolean;
  /** Alert when an inbox conversation assigned to you has waited a day. */
  inboxFollowups: boolean;
  scheduledReminders: { enabled: boolean; offsets: number[] };
  draftReminders: { enabled: boolean; afterDays: number };
  calendarGap: { enabled: boolean; daysAhead: number };
  /** Opt-in: "you have not posted in N days", at roughly this hour in the user's own timezone. */
  postingReminder: { enabled: boolean; afterDays: number; hour: number };
  milestones: { enabled: boolean; thresholds: number[] };
  /**
   * Browser / phone notifications while the app is closed (Web Push). Applies to every device the person turned them on for.
   * Required types (payment failures, security changes, a dead connection) ignore the category and priority filters.
   */
  push: {
    enabled: boolean;
    /** Nothing below this priority is pushed. It still appears in the bell. */
    minPriority: NotificationPriority;
    categories: Record<NotificationCategory, boolean>;
    /** Local time window in the person's own timezone. Critical alerts still come through. */
    quietHours: { enabled: boolean; start: string; end: string };
  };
  /** A short chime when something new arrives while the app is open. */
  sound: { enabled: boolean; volume: number };
};

export function defaultSettings(): NotificationSettings {
  return {
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<NotificationCategory, boolean>,
    toasts: true,
    publishSuccess: true,
    inboxFollowups: true,
    scheduledReminders: { enabled: true, offsets: [60] },
    draftReminders: { enabled: true, afterDays: 3 },
    calendarGap: { enabled: false, daysAhead: 3 },
    postingReminder: { enabled: false, afterDays: 3, hour: 9 },
    milestones: { enabled: true, thresholds: [1000, 5000, 10000] },
    push: {
      enabled: true,
      minPriority: "normal",
      categories: Object.fromEntries(CATEGORIES.map((c) => [c, true])) as Record<NotificationCategory, boolean>,
      quietHours: { enabled: false, start: "22:00", end: "07:00" },
    },
    sound: { enabled: true, volume: 60 },
  };
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback;
}

function int(v: unknown, fallback: number, min: number, max: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function clock(v: unknown, fallback: string): string {
  return typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : fallback;
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function pick<T extends number>(v: unknown, allowed: readonly T[], fallback: T[]): T[] {
  if (!Array.isArray(v)) return fallback;
  const out = allowed.filter((a) => v.includes(a));
  return out;
}

/** Turn whatever is stored (or nothing) into a complete, valid settings object. */
export function parseSettings(raw: string | null | undefined): NotificationSettings {
  const d = defaultSettings();
  if (!raw) return d;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return d;
  }
  const s = obj(parsed);
  const cats = obj(s.categories);
  const sr = obj(s.scheduledReminders);
  const dr = obj(s.draftReminders);
  const cg = obj(s.calendarGap);
  const pr = obj(s.postingReminder);
  const ms = obj(s.milestones);
  const pu = obj(s.push);
  const pc = obj(pu.categories);
  const pq = obj(pu.quietHours);
  const so = obj(s.sound);
  return {
    categories: Object.fromEntries(CATEGORIES.map((c) => [c, bool(cats[c], true)])) as Record<NotificationCategory, boolean>,
    toasts: bool(s.toasts, d.toasts),
    publishSuccess: bool(s.publishSuccess, d.publishSuccess),
    inboxFollowups: bool(s.inboxFollowups, d.inboxFollowups),
    scheduledReminders: {
      enabled: bool(sr.enabled, d.scheduledReminders.enabled),
      offsets: pick(sr.offsets, REMINDER_OFFSETS, d.scheduledReminders.offsets),
    },
    draftReminders: { enabled: bool(dr.enabled, d.draftReminders.enabled), afterDays: int(dr.afterDays, d.draftReminders.afterDays, 1, 30) },
    calendarGap: { enabled: bool(cg.enabled, d.calendarGap.enabled), daysAhead: int(cg.daysAhead, d.calendarGap.daysAhead, 1, 14) },
    postingReminder: {
      enabled: bool(pr.enabled, d.postingReminder.enabled),
      afterDays: int(pr.afterDays, d.postingReminder.afterDays, 1, 30),
      hour: int(pr.hour, d.postingReminder.hour, 0, 23),
    },
    milestones: {
      enabled: bool(ms.enabled, d.milestones.enabled),
      thresholds: pick(ms.thresholds, MILESTONE_CHOICES, d.milestones.thresholds),
    },
    push: {
      enabled: bool(pu.enabled, d.push.enabled),
      minPriority: (PRIORITIES as readonly string[]).includes(pu.minPriority as string) ? (pu.minPriority as NotificationPriority) : d.push.minPriority,
      categories: Object.fromEntries(CATEGORIES.map((c) => [c, bool(pc[c], true)])) as Record<NotificationCategory, boolean>,
      quietHours: {
        enabled: bool(pq.enabled, d.push.quietHours.enabled),
        start: clock(pq.start, d.push.quietHours.start),
        end: clock(pq.end, d.push.quietHours.end),
      },
    },
    sound: { enabled: bool(so.enabled, d.sound.enabled), volume: int(so.volume, d.sound.volume, 0, 100) },
  };
}

export function serializeSettings(s: NotificationSettings): string {
  return JSON.stringify(parseSettings(JSON.stringify(s)));
}

/**
 * Should this notification type reach the user's bell? The master "In-app notifications" switch
 * (inappAll) and the per-category switch both apply, except for required types (payment failures,
 * security changes, a dead connection), which always get through.
 */
export function shouldDeliverInApp(type: string, settings: NotificationSettings, inappAll: boolean): boolean {
  if (isRequiredType(type)) return true;
  if (!inappAll) return false;
  if (type === "publish_success" && settings.publishSuccess === false) return false;
  if (type === "inbox_followup" && settings.inboxFollowups === false) return false;
  return settings.categories[categoryOf(type)] !== false;
}
