import { UNTRACKED } from "@/lib/attribution";

/**
 * Acquisition report maths — pure (no DB). The DB layer feeds it raw visit and
 * signup rows; this turns them into grouped funnel numbers and plain-language
 * insights. Kept separate so the numbers an admin acts on are unit-tested.
 */

export type GroupBy = "channel" | "source" | "medium" | "campaign" | "landing" | "referrer";
export type Touch = "first" | "last";

export type VisitRow = {
  visitorId: string;
  createdAt: Date;
  channel: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrerHost: string | null;
  landingPath: string;
};

export type SignupRow = {
  createdAt: Date;
  attribution: {
    channel: string;
    source: string | null;
    medium: string | null;
    campaign: string | null;
    referrerHost: string | null;
    landingPath: string | null;
    lastChannel: string | null;
    lastSource: string | null;
    lastMedium: string | null;
    lastCampaign: string | null;
  } | null;
  /** Connected a channel or created a post. */
  activated: boolean;
  /** On an entitled, paid plan. */
  paid: boolean;
  /** Monthly recurring revenue in minor units, per currency. */
  mrr: { usd: number; inr: number };
};

export type ReportRow = {
  key: string;
  visitors: number;
  visits: number;
  signups: number;
  activated: number;
  paid: number;
  mrr: { usd: number; inr: number };
  /** signups / visitors, null when the group has no tracked visitors. */
  signupRate: number | null;
  /** Share of all signups. */
  share: number;
};

export type Report = {
  groupBy: GroupBy;
  touch: Touch;
  totals: {
    visitors: number;
    visits: number;
    signups: number;
    activated: number;
    paid: number;
    mrr: { usd: number; inr: number };
    signupRate: number | null;
    untrackedSignups: number;
  };
  rows: ReportRow[];
  series: { label: string; visitors: number; signups: number }[];
  previous: { visitors: number; signups: number } | null;
};

const DAY = 86_400_000;
const NONE = "(none)";

function visitKey(v: VisitRow, g: GroupBy): string {
  switch (g) {
    case "channel":
      return v.channel;
    case "source":
      return v.source ?? NONE;
    case "medium":
      return v.medium ?? NONE;
    case "campaign":
      return v.campaign ?? NONE;
    case "landing":
      return v.landingPath;
    case "referrer":
      return v.referrerHost ?? NONE;
  }
}

function signupKey(s: SignupRow, g: GroupBy, t: Touch): string {
  const a = s.attribution;
  if (!a) return UNTRACKED;
  const last = t === "last";
  switch (g) {
    case "channel":
      return (last ? a.lastChannel : a.channel) ?? a.channel;
    case "source":
      return (last ? a.lastSource : a.source) ?? NONE;
    case "medium":
      return (last ? a.lastMedium : a.medium) ?? NONE;
    case "campaign":
      return (last ? a.lastCampaign : a.campaign) ?? NONE;
    case "landing":
      return a.landingPath ?? NONE;
    case "referrer":
      return a.referrerHost ?? NONE;
  }
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const addMrr = (a: { usd: number; inr: number }, b: { usd: number; inr: number }) => ({ usd: a.usd + b.usd, inr: a.inr + b.inr });

export function buildReport(input: {
  visits: VisitRow[];
  signups: SignupRow[];
  groupBy: GroupBy;
  touch: Touch;
  days: number;
  now?: Date;
  previous?: { visitors: number; signups: number } | null;
}): Report {
  const { visits, signups, groupBy, touch, days } = input;
  const now = input.now ?? new Date();

  type Acc = { visitorIds: Set<string>; visits: number; signups: number; activated: number; paid: number; mrr: { usd: number; inr: number } };
  const groups = new Map<string, Acc>();
  const get = (k: string): Acc => {
    let g = groups.get(k);
    if (!g) {
      g = { visitorIds: new Set(), visits: 0, signups: 0, activated: 0, paid: 0, mrr: { usd: 0, inr: 0 } };
      groups.set(k, g);
    }
    return g;
  };

  const allVisitors = new Set<string>();
  for (const v of visits) {
    const g = get(visitKey(v, groupBy));
    g.visitorIds.add(v.visitorId);
    g.visits++;
    allVisitors.add(v.visitorId);
  }

  let activated = 0;
  let paid = 0;
  let untrackedSignups = 0;
  let mrr = { usd: 0, inr: 0 };
  for (const s of signups) {
    const g = get(signupKey(s, groupBy, touch));
    g.signups++;
    if (s.activated) {
      g.activated++;
      activated++;
    }
    if (s.paid) {
      g.paid++;
      paid++;
    }
    g.mrr = addMrr(g.mrr, s.mrr);
    mrr = addMrr(mrr, s.mrr);
    if (!s.attribution) untrackedSignups++;
  }

  const totalSignups = signups.length;
  const rows: ReportRow[] = [...groups.entries()]
    .map(([key, g]) => ({
      key,
      visitors: g.visitorIds.size,
      visits: g.visits,
      signups: g.signups,
      activated: g.activated,
      paid: g.paid,
      mrr: g.mrr,
      signupRate: g.visitorIds.size > 0 ? g.signups / g.visitorIds.size : null,
      share: totalSignups ? g.signups / totalSignups : 0,
    }))
    .sort((a, b) => b.signups - a.signups || b.visitors - a.visitors || a.key.localeCompare(b.key));

  // Daily series (visitors counted unique per day).
  const idx = new Map<string, number>();
  const series: Report["series"] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    idx.set(dayKey(d), series.length);
    series.push({ label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }), visitors: 0, signups: 0 });
  }
  const perDay = new Map<string, Set<string>>();
  for (const v of visits) {
    const k = dayKey(v.createdAt);
    if (!perDay.has(k)) perDay.set(k, new Set());
    perDay.get(k)!.add(v.visitorId);
  }
  for (const [k, set] of perDay) {
    const i = idx.get(k);
    if (i !== undefined) series[i].visitors = set.size;
  }
  for (const s of signups) {
    const i = idx.get(dayKey(s.createdAt));
    if (i !== undefined) series[i].signups++;
  }

  return {
    groupBy,
    touch,
    totals: {
      visitors: allVisitors.size,
      visits: visits.length,
      signups: totalSignups,
      activated,
      paid,
      mrr,
      signupRate: allVisitors.size > 0 ? totalSignups / allVisitors.size : null,
      untrackedSignups,
    },
    rows,
    series,
    previous: input.previous ?? null,
  };
}

// ---- insights ----------------------------------------------------------------

export type Insight = {
  id: string;
  tone: "good" | "warn" | "info";
  title: string;
  detail: string;
  /** Group + key the insight is about, so the UI can link to an audience. */
  about?: { groupBy: GroupBy; key: string };
};

export const MIN_VISITORS_FOR_RATE = 50;
export const MIN_VISITORS_FOR_WASTE = 100;
const pct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

/**
 * Plain-language findings, each guarded by a minimum sample so a single lucky
 * signup on 3 visitors never gets called "your best channel".
 */
export function marketingInsights(r: Report): Insight[] {
  const out: Insight[] = [];
  const t = r.totals;
  const real = r.rows.filter((row) => row.key !== UNTRACKED && row.key !== NONE);

  if (t.signups >= 10 && t.untrackedSignups / t.signups >= 0.3) {
    out.push({
      id: "untracked",
      tone: "warn",
      title: `${pct(t.untrackedSignups / t.signups, 0)} of signups have no tracking data`,
      detail: "They signed up before tracking started or arrived with tracking blocked. Tag every campaign link with the UTM builder so new signups are attributed.",
    });
  }

  if (r.previous && r.previous.signups >= 5) {
    const delta = (t.signups - r.previous.signups) / r.previous.signups;
    if (Math.abs(delta) >= 0.2) {
      out.push({
        id: "trend",
        tone: delta > 0 ? "good" : "warn",
        title: `Signups ${delta > 0 ? "up" : "down"} ${pct(Math.abs(delta), 0)} vs the previous period`,
        detail: `${t.signups} signups now vs ${r.previous.signups} before.`,
      });
    }
  }

  const overall = t.signupRate;
  const eligible = real.filter((row) => row.visitors >= MIN_VISITORS_FOR_RATE && row.signupRate !== null);
  if (overall && overall > 0 && eligible.length >= 2) {
    const best = [...eligible].sort((a, b) => b.signupRate! - a.signupRate!)[0];
    if (best.signupRate! >= overall * 1.5 && best.signups >= 3) {
      out.push({
        id: "best-converter",
        tone: "good",
        title: `${best.key} converts ${(best.signupRate! / overall).toFixed(1)}× better than average`,
        detail: `${pct(best.signupRate!)} of its ${best.visitors} visitors signed up (overall ${pct(overall)}). Worth more budget or a similar audience.`,
        about: { groupBy: r.groupBy, key: best.key },
      });
    }
  }

  const waste = real.filter((row) => row.visitors >= MIN_VISITORS_FOR_WASTE && row.signups === 0).sort((a, b) => b.visitors - a.visitors)[0];
  if (waste) {
    out.push({
      id: "no-signups",
      tone: "warn",
      title: `${waste.key} sent ${waste.visitors} visitors and no signups`,
      detail: "Check the landing page it points to and whether the audience matches the offer before spending more on it.",
      about: { groupBy: r.groupBy, key: waste.key },
    });
  }

  const topRevenue = [...real].filter((row) => row.mrr.usd + row.mrr.inr > 0).sort((a, b) => b.mrr.usd + b.mrr.inr - (a.mrr.usd + a.mrr.inr))[0];
  if (topRevenue && topRevenue.paid > 0) {
    out.push({
      id: "top-revenue",
      tone: "info",
      title: `${topRevenue.key} brings the most paying customers`,
      detail: `${topRevenue.paid} paying customer${topRevenue.paid === 1 ? "" : "s"} from ${topRevenue.signups} signup${topRevenue.signups === 1 ? "" : "s"}.`,
      about: { groupBy: r.groupBy, key: topRevenue.key },
    });
  }

  const activation = real.filter((row) => row.signups >= 10 && row.activated / row.signups <= 0.2);
  if (activation.length) {
    const w = activation.sort((a, b) => b.signups - a.signups)[0];
    out.push({
      id: "low-activation",
      tone: "warn",
      title: `Only ${pct(w.activated / w.signups, 0)} of ${w.key} signups get started`,
      detail: "They sign up but don't connect a channel or create a post. A targeted onboarding card or broadcast to this audience can help.",
      about: { groupBy: r.groupBy, key: w.key },
    });
  }

  return out;
}
