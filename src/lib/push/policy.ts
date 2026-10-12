import type { NotificationSettings } from "@/lib/notifications/prefs";
import { isRequiredType, type NotificationCategory, type NotificationPriority } from "@/lib/notifications/types";

/**
 * Whether one notification may be pushed to a person's devices. Pure, so every rule is testable on its own.
 * The notification already passed the in-app rules (it exists); these decide the extra interruption of a push.
 */

const RANK: Record<NotificationPriority, number> = { low: 0, normal: 1, high: 2, critical: 3 };

function minutes(clock: string): number {
  const [h, m] = clock.split(":").map(Number);
  return h * 60 + m;
}

/** Minutes since local midnight for `now` in an IANA timezone; an unknown or missing zone falls back to UTC. */
export function localMinutes(now: Date, timeZone: string | null | undefined): number {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: timeZone || "UTC" }).formatToParts(now);
    const h = Number(parts.find((p) => p.type === "hour")?.value);
    const m = Number(parts.find((p) => p.type === "minute")?.value);
    if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
  } catch {
    /* fall through to UTC */
  }
  return now.getUTCHours() * 60 + now.getUTCMinutes();
}

/** True inside the window; a window like 22:00 to 07:00 runs across midnight. Start equal to end means no window. */
export function inQuietHours(now: Date, timeZone: string | null | undefined, q: { enabled: boolean; start: string; end: string }): boolean {
  if (!q.enabled) return false;
  const start = minutes(q.start);
  const end = minutes(q.end);
  if (start === end) return false;
  const t = localMinutes(now, timeZone);
  return start < end ? t >= start && t < end : t >= start || t < end;
}

export function shouldPush(args: {
  type: string;
  category: NotificationCategory;
  priority: NotificationPriority;
  settings: NotificationSettings;
  timeZone?: string | null;
  now?: Date;
}): boolean {
  const { settings: s } = args;
  if (!s.push.enabled) return false;
  const required = isRequiredType(args.type);
  if (!required) {
    if (s.push.categories[args.category] === false) return false;
    if (RANK[args.priority] < RANK[s.push.minPriority]) return false;
  }
  if (args.priority !== "critical" && inQuietHours(args.now ?? new Date(), args.timeZone, s.push.quietHours)) return false;
  return true;
}
