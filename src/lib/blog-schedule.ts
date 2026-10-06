/**
 * Plans when a batch of blog posts goes live: N posts per day, each at a random
 * time inside one of a few daytime windows, so the cadence looks natural and
 * never bunches. Pure and seeded: the same inputs always give the same plan, so
 * a preview in the admin matches what gets scheduled.
 */

/** Windows are UTC minutes-of-day. They cover roughly 9am–10pm in India, mid-morning to evening in Europe, early morning to afternoon in the US. */
export const DEFAULT_WINDOWS: readonly (readonly [number, number])[] = [
  [3 * 60 + 30, 6 * 60 + 30],
  [8 * 60, 11 * 60 + 30],
  [13 * 60, 16 * 60 + 30],
];

/** mulberry32: small, fast, good enough for spreading times. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type SchedulePlanOptions = {
  /** First day, as a Date at any time; only its UTC date is used. */
  startDay: Date;
  count: number;
  perDay?: number;
  seed?: number;
  windows?: readonly (readonly [number, number])[];
  /** Never schedule earlier than this (e.g. now + a few minutes on the first day). */
  notBefore?: Date;
};

export function planSchedule(opts: SchedulePlanOptions): Date[] {
  const perDay = Math.max(1, Math.min(opts.perDay ?? 3, (opts.windows ?? DEFAULT_WINDOWS).length));
  const windows = (opts.windows ?? DEFAULT_WINDOWS).slice(0, perDay);
  const rand = seededRandom(opts.seed ?? 20261007);
  const dayStart = Date.UTC(opts.startDay.getUTCFullYear(), opts.startDay.getUTCMonth(), opts.startDay.getUTCDate());
  const floor = opts.notBefore?.getTime() ?? 0;

  const out: Date[] = [];
  for (let day = 0; out.length < opts.count; day++) {
    for (const [from, to] of windows) {
      if (out.length >= opts.count) break;
      const minute = from + Math.floor(rand() * (to - from));
      let at = dayStart + day * 86_400_000 + minute * 60_000;
      if (at < floor) at = floor + Math.floor(rand() * 30) * 60_000 + 5 * 60_000;
      out.push(new Date(at));
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime());
}

/**
 * Order items so neighbours differ by group (round-robin across groups): each day's
 * three posts then cover different topics instead of three near-duplicates.
 */
export function interleaveByGroup<T>(items: readonly T[], groupOf: (t: T) => string): T[] {
  const groups = new Map<string, T[]>();
  for (const it of items) {
    const g = groupOf(it);
    groups.set(g, [...(groups.get(g) ?? []), it]);
  }
  const queues = [...groups.values()];
  const out: T[] = [];
  while (out.length < items.length) {
    for (const q of queues) {
      const next = q.shift();
      if (next !== undefined) out.push(next);
    }
  }
  return out;
}
