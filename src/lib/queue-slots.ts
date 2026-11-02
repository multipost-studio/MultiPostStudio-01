import { dayKeyIn, wallTimeToInstant, zonedParts } from "./tz-math";

/**
 * The free places in a queue: each channel's weekly posting slots, turned into real moments for the coming days, minus the ones a
 * scheduled post already holds. Slots are wall-clock times ("Wednesday 4 p.m.") in `slotTz`, the time zone the person's schedule
 * is kept in (their profile zone, the same one "Add to queue" uses), so this lists exactly the moments "Add to queue" would pick.
 * Pure; everything the Queue shows as an open place comes from here.
 */

export type SlotRow = { channelId: string; weekday: number; hour: number; minute: number };
export type ScheduledRef = { channelIds: string[]; when: string };
export type OpenSlot = { channelId: string; at: string };

export function upcomingOpenSlots(input: { slots: SlotRow[]; scheduled: ScheduledRef[]; slotTz: string; from: Date; days: number }): OpenSlot[] {
  const { slots, scheduled, slotTz, from } = input;
  const days = Math.max(0, Math.min(60, Math.floor(input.days)));
  if (slots.length === 0 || days === 0) return [];

  // an hour is taken when a scheduled post for that channel sits anywhere inside it, like "Add to queue" decides
  const taken = new Set<string>();
  for (const s of scheduled) {
    const d = new Date(s.when);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${dayKeyIn(d, slotTz)}-${zonedParts(d, slotTz).hour}`;
    for (const c of s.channelIds) taken.add(`${c}|${key}`);
  }

  const base = zonedParts(from, slotTz);
  const out: OpenSlot[] = [];
  for (let i = 0; i < days; i++) {
    const u = new Date(Date.UTC(base.year, base.month, base.day + i)); // a plain calendar day: no daylight saving surprises
    const y = u.getUTCFullYear();
    const m = u.getUTCMonth();
    const d = u.getUTCDate();
    const weekday = u.getUTCDay();
    for (const s of slots) {
      if (s.weekday !== weekday) continue;
      const at = wallTimeToInstant(y, m, d, s.hour, s.minute, slotTz);
      if (at.getTime() <= from.getTime()) continue;
      if (taken.has(`${s.channelId}|${y}-${m}-${d}-${s.hour}`)) continue;
      out.push({ channelId: s.channelId, at: at.toISOString() });
    }
  }
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.channelId.localeCompare(b.channelId));
}
