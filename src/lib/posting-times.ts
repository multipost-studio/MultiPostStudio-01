/**
 * Starting posting times, taken from published research and labelled as such.
 *
 * This app once showed invented posting advice (see lib/scheduling.ts), so nothing here is made up: every window below is copied
 * from Sprout Social's "Best Times to Post on Social Media 2026" (updated March 2026), which analysed nearly 2 billion engagements
 * on roughly 307,000 profiles between 27 Nov 2025 and 27 Feb 2026, in each audience's LOCAL time. It publishes times per network.
 * It does NOT publish times per industry, so the industry is not used to pick times: no industry numbers are invented.
 *
 * Networks the study does not cover (YouTube, Threads, Bluesky, Google Business Profile) get the study's overall result
 * (Tuesdays and Wednesdays, midday to late afternoon) and are shown as such.
 *
 * These are a starting point. As posts are published the app measures this workspace's own results (see recommendTimes) and the
 * person can change the times at any moment.
 */

export const POSTING_RESEARCH = {
  source: "Sprout Social",
  title: "Best Times to Post on Social Media 2026",
  updated: "March 2026",
  url: "https://sproutsocial.com/insights/best-times-to-post-on-social-media/",
  basis: "nearly 2 billion engagements across about 307,000 profiles, 27 Nov 2025 to 27 Feb 2026, in local time",
} as const;

/** Hours on a 24-hour clock, `from` included and `to` not: 13 to 19 is 1 p.m. up to 7 p.m. */
export type Window = { from: number; to: number };
type Week = Partial<Record<number, Window[]>>; // 0 = Sunday ... 6 = Saturday

const W = (from: number, to: number): Window => ({ from, to });

/** The study's per-network windows, transcribed as published (Mon = 1 ... Fri = 5). */
const BY_NETWORK: Record<string, Week> = {
  facebook: { 1: [W(12, 13)], 2: [W(12, 20)], 3: [W(12, 20)], 4: [W(12, 14), W(20, 21)] },
  instagram: { 1: [W(14, 16)], 2: [W(13, 19)], 3: [W(12, 21), W(23, 24)], 4: [W(12, 14)] },
  tiktok: { 1: [W(15, 17)], 2: [W(14, 18)], 3: [W(13, 20)], 4: [W(13, 17)], 5: [W(15, 17)] },
  x: { 1: [W(14, 15), W(17, 18)], 2: [W(12, 18)], 3: [W(12, 18)], 4: [W(12, 18)] },
  linkedin: { 1: [W(13, 14)], 2: [W(11, 17)], 3: [W(11, 16)], 4: [W(11, 12), W(13, 17)], 5: [W(11, 12), W(13, 14)] },
  pinterest: { 1: [W(10, 12), W(14, 15)], 2: [W(7, 8), W(10, 13)], 3: [W(8, 13), W(15, 16)], 4: [W(10, 11), W(14, 16)], 5: [W(10, 11)] },
};

/** The study's overall result: Tuesdays and Wednesdays, 12 to 6 p.m. */
const OVERALL: Week = { 2: [W(12, 18)], 3: [W(12, 18)] };

export type Research = { week: Week; specific: boolean };

export function researchFor(platform: string): Research {
  const week = BY_NETWORK[platform];
  return week ? { week, specific: true } : { week: OVERALL, specific: false };
}

export type Slot = { weekday: number; hour: number; minute: number };

/** Pass this instead of a channel id to set posting times on every channel that has none yet. */
export const ALL_EMPTY_CHANNELS = "all-empty";

/** How many posts a week the person asks for. */
export const POSTS_PER_WEEK = [1, 3, 5] as const;

const MIN_SECOND_SLOT_WINDOW = 2; // hours: a one-hour window is too thin to hold a second post
const MIN_GAP_HOURS = 3;

/**
 * A weekly schedule from the research for one network: the widest windows first (the study's strongest days), one post on each
 * day, then a second on a day with room. Posts go to the middle of their window. Never more than the research supports, so asking
 * for 5 on a network with 4 good days gives 4.
 */
export function suggestSlots(platform: string, perWeek: number): Slot[] {
  const want = Math.max(1, Math.min(7, Math.round(perWeek)));
  const { week } = researchFor(platform);
  type Cand = { weekday: number; hour: number; len: number };
  const cands: Cand[] = [];
  for (const [d, wins] of Object.entries(week)) {
    for (const w of wins ?? []) {
      const len = w.to - w.from;
      cands.push({ weekday: Number(d), hour: Math.min(w.to - 1, w.from + Math.floor(len / 2)), len });
    }
  }
  cands.sort((a, b) => b.len - a.len || a.weekday - b.weekday || a.hour - b.hour);

  const picked: Cand[] = [];
  const days = new Set<number>();
  for (const c of cands) {
    if (picked.length >= want) break;
    if (days.has(c.weekday)) continue;
    picked.push(c);
    days.add(c.weekday);
  }
  for (const c of cands) {
    if (picked.length >= want) break;
    if (c.len < MIN_SECOND_SLOT_WINDOW || picked.includes(c)) continue;
    if (picked.some((p) => p.weekday === c.weekday && Math.abs(p.hour - c.hour) < MIN_GAP_HOURS)) continue;
    picked.push(c);
  }
  return picked.sort((a, b) => a.weekday - b.weekday || a.hour - b.hour).map((c) => ({ weekday: c.weekday, hour: c.hour, minute: 0 }));
}

const DAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const hour12 = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h % 24 >= 12 && h !== 24 ? " p.m." : " a.m."}`;

/** "Tuesdays 1 to 7 p.m." lines for the network, as the study published them. */
export function describeResearch(platform: string): string[] {
  const { week } = researchFor(platform);
  return Object.entries(week)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([d, wins]) => `${DAY[Number(d)]}s ${(wins ?? []).map((w) => `${hour12(w.from)} to ${hour12(w.to === 24 ? 0 : w.to)}`).join(" and ")}`);
}

/** "Wednesday 4 p.m." for a slot. */
export function describeSlot(s: Slot): string {
  return `${DAY[s.weekday]} ${hour12(s.hour)}`;
}
