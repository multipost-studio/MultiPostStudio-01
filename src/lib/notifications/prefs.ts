import { CATEGORIES, categoryOf, isRequiredType, type NotificationCategory } from "./types";

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
