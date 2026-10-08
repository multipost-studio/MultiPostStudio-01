import { FESTIVALS, FESTIVAL_BY_ID } from "./catalog";
import { addDays, diffDays, occurrencesInYear, todayIn, ymd, type YMD } from "./calendar";
import type { ActiveFestival, CustomFestival, Festival, FestivalConfig, FestivalOverride, Resolution, UpcomingFestival } from "./types";

/**
 * Decides which festival (if any) is live. Precedence, highest first:
 *   1. the master switch (off means nothing, whatever else is set)
 *   2. an admin's manual choice, until its end date
 *   3. custom festivals the admin scheduled
 *   4. the preset calendar, only when auto mode is on
 * Pure and deterministic: the same config and clock always give the same answer.
 */

type Window = { date: YMD; start: YMD; end: YMD };

const CUSTOM_BONUS = 100_000;
const UPCOMING_COUNT = 6;

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Moves a date by whole years, clamping Feb 29 on non-leap years. */
export function shiftYears(date: YMD, years: number): YMD {
  const [y, m, d] = date.split("-").map(Number);
  return ymd(y + years, m, Math.min(d, daysInMonth(y + years, m)));
}

function presetWindows(f: Festival, ov: FestivalOverride | undefined, year: number): Window[] {
  const before = ov?.before ?? f.before;
  const after = ov?.after ?? f.after;
  const out: Window[] = [];
  for (const y of [year - 1, year, year + 1]) {
    const overridden = ov?.dateOverride && Number(ov.dateOverride.slice(0, 4)) === y ? [ov.dateOverride] : occurrencesInYear(f.rule, y);
    for (const date of overridden) out.push({ date, start: addDays(date, -before), end: addDays(date, after) });
  }
  return out;
}

function customWindows(c: CustomFestival, year: number): Window[] {
  if (!c.yearly) return [{ date: c.startsOn, start: c.startsOn, end: c.endsOn }];
  const base = Number(c.startsOn.slice(0, 4));
  return [year - 1, year, year + 1].map((y) => {
    const k = y - base;
    return { date: shiftYears(c.startsOn, k), start: shiftYears(c.startsOn, k), end: shiftYears(c.endsOn, k) };
  });
}

const within = (w: Window, today: YMD) => w.start <= today && today <= w.end;

function activeFrom(f: Festival, source: ActiveFestival["source"], id: string, name: string, message: string | undefined, w: { start: YMD; end: YMD }): ActiveFestival {
  return { id, themeId: f.id, name, message: message?.trim() || f.greeting, source, startsOn: w.start, endsOn: w.end };
}

export function resolveFestivals(config: FestivalConfig, nowMs: number = Date.now()): Resolution {
  const today = todayIn(config.timezone, nowMs);
  const year = Number(today.slice(0, 4));
  const upcoming = buildUpcoming(config, today, year);
  if (!config.enabled) return { today, active: null, upcoming };

  const customById = new Map(config.custom.map((c) => [c.id, c]));

  const { festivalId, until } = config.manual;
  if (festivalId && (until === null || today <= until)) {
    const preset = FESTIVAL_BY_ID[festivalId];
    const custom = customById.get(festivalId);
    const theme = preset ?? (custom ? FESTIVAL_BY_ID[custom.themeId] : undefined);
    if (theme) {
      const name = preset ? preset.name : custom!.name;
      const message = preset ? config.overrides[preset.id]?.message : custom!.message;
      return { today, upcoming, active: activeFrom(theme, "manual", festivalId, name, message, { start: today, end: until ?? "" }) };
    }
  }

  let best: { score: number; active: ActiveFestival } | null = null;
  const consider = (score: number, active: ActiveFestival) => {
    if (!best || score > best.score) best = { score, active };
  };

  for (const c of config.custom) {
    const theme = FESTIVAL_BY_ID[c.themeId];
    if (!theme) continue;
    for (const w of customWindows(c, year)) {
      if (within(w, today)) consider(CUSTOM_BONUS + theme.priority, activeFrom(theme, "custom", c.id, c.name, c.message, w));
    }
  }

  if (config.autoMode) {
    for (const f of FESTIVALS) {
      const ov = config.overrides[f.id];
      if (ov?.auto === false) continue;
      for (const w of presetWindows(f, ov, year)) {
        // Closer to the festival day wins a tie between equal priorities.
        if (within(w, today)) consider(f.priority * 100 - Math.abs(diffDays(w.date, today)), activeFrom(f, "auto", f.id, f.name, ov?.message, w));
      }
    }
  }

  return { today, upcoming, active: (best as { active: ActiveFestival } | null)?.active ?? null };
}

function buildUpcoming(config: FestivalConfig, today: YMD, year: number): UpcomingFestival[] {
  const list: UpcomingFestival[] = [];
  const push = (id: string, name: string, emoji: string, ws: Window[]) => {
    const next = ws.filter((w) => w.end >= today).sort((a, b) => (a.start < b.start ? -1 : 1))[0];
    if (next) list.push({ id, name, emoji, date: next.date, startsOn: next.start, endsOn: next.end, daysAway: diffDays(next.start, today) });
  };
  for (const f of FESTIVALS) {
    const ov = config.overrides[f.id];
    if (ov?.auto === false) continue;
    push(f.id, f.name, f.emoji, presetWindows(f, ov, year));
  }
  for (const c of config.custom) push(c.id, c.name, FESTIVAL_BY_ID[c.themeId]?.emoji ?? "🎉", customWindows(c, year));
  return list.sort((a, b) => (a.startsOn < b.startsOn ? -1 : a.startsOn > b.startsOn ? 1 : 0)).slice(0, UPCOMING_COUNT);
}

/** The next dated occurrence of one preset, for the admin cards ("Next: 8 Nov 2026"). */
export function nextOccurrence(config: FestivalConfig, festivalId: string, today: YMD): { date: YMD; startsOn: YMD; endsOn: YMD } | null {
  const f = FESTIVAL_BY_ID[festivalId];
  if (!f) return null;
  const ws = presetWindows(f, config.overrides[f.id], Number(today.slice(0, 4))).filter((w) => w.end >= today);
  const next = ws.sort((a, b) => (a.start < b.start ? -1 : 1))[0];
  return next ? { date: next.date, startsOn: next.start, endsOn: next.end } : null;
}
