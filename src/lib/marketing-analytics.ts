import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { addMrr, subscriptionMrr, ZERO_MRR, type Mrr } from "@/lib/mrr";
import { effectivePlanKey, matchesPlan, segmentWhere, type SegmentFilter } from "@/lib/audience";
import { buildReport, marketingInsights, type GroupBy, type Insight, type Report, type SignupRow, type Touch, type VisitRow } from "@/lib/marketing-report";

/**
 * DB layer for the admin Marketing module. Aggregation follows the existing
 * admin-analytics pattern (bounded fetch, bucket in JS); the maths lives in the
 * pure modules so it is tested without a database.
 */

const DAY = 86_400_000;
const VISIT_CAP = 100_000;
const USER_CAP = 20_000;

const subSelect = {
  status: true,
  interval: true,
  provider: true,
  discountPct: true,
  currentPeriodEnd: true,
  trialEndsAt: true,
  canceledAt: true,
  plan: { select: { key: true, priceMonthly: true, priceAnnual: true, priceMonthlyInr: true, priceAnnualInr: true } },
} as const;

const attributionSelect = {
  channel: true,
  source: true,
  medium: true,
  campaign: true,
  referrerHost: true,
  landingPath: true,
  lastChannel: true,
  lastSource: true,
  lastMedium: true,
  lastCampaign: true,
} as const;

export type AcquisitionReport = {
  report: Report;
  insights: Insight[];
  days: number;
  /** Set for a custom window: the exact dates covered (UTC days). */
  custom?: { from: string; to: string } | null;
  /** True when a cap was hit and numbers are a lower bound. */
  truncated: boolean;
  /** Whether any visit has ever been recorded (to tell "no data yet" from "quiet period"). */
  trackingHasData: boolean;
};

export async function getAcquisitionReport(opts: { days: number; groupBy: GroupBy; touch: Touch; range?: { from: Date; to: Date; fromDay: string; toDay: string } | null }): Promise<AcquisitionReport> {
  const { days, groupBy, touch, range } = opts;
  // A custom window ends at its last day (or now, if that is today) and starts at the beginning of its first day.
  const now = range ? range.to : new Date();
  const start = range ? range.from : new Date(now.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);

  const [visitRows, signupUsers, prevVisitors, prevSignups, anyVisit] = await Promise.all([
    db.acquisitionVisit.findMany({
      where: { createdAt: { gte: start, lte: now } },
      take: VISIT_CAP,
      orderBy: { createdAt: "desc" },
      select: { visitorId: true, createdAt: true, channel: true, source: true, medium: true, campaign: true, referrerHost: true, landingPath: true },
    }),
    db.user.findMany({
      where: { deletedAt: null, createdAt: { gte: start, lte: now } },
      take: USER_CAP,
      orderBy: { createdAt: "desc" },
      select: {
        createdAt: true,
        attribution: { select: attributionSelect },
        memberships: {
          where: { role: "owner" },
          select: {
            org: {
              select: {
                subscription: { select: subSelect },
                workspaces: { select: { _count: { select: { socialAccounts: true, posts: true } } } },
              },
            },
          },
        },
      },
    }),
    db.acquisitionVisit.findMany({ where: { createdAt: { gte: prevStart, lt: start } }, distinct: ["visitorId"], take: VISIT_CAP, select: { visitorId: true } }),
    db.user.count({ where: { deletedAt: null, createdAt: { gte: prevStart, lt: start } } }),
    db.acquisitionVisit.findFirst({ select: { id: true } }),
  ]);

  const signups: SignupRow[] = signupUsers.map((u) => {
    let mrr: Mrr = ZERO_MRR;
    let paid = false;
    let activated = false;
    for (const m of u.memberships) {
      const sub = m.org.subscription;
      const value = subscriptionMrr(sub);
      if (value.usd + value.inr > 0) paid = true;
      mrr = addMrr(mrr, value);
      if (m.org.workspaces.some((w) => w._count.socialAccounts > 0 || w._count.posts > 0)) activated = true;
    }
    return { createdAt: u.createdAt, attribution: u.attribution, activated, paid, mrr };
  });

  const visits: VisitRow[] = visitRows;
  const report = buildReport({ visits, signups, groupBy, touch, days, now, previous: { visitors: prevVisitors.length, signups: prevSignups } });
  return {
    report,
    insights: marketingInsights(report),
    days,
    custom: range ? { from: range.fromDay, to: range.toDay } : null,
    truncated: visitRows.length >= VISIT_CAP || signupUsers.length >= USER_CAP,
    trackingHasData: !!anyVisit,
  };
}

/** Light summary for the admin Overview card. Never throws. */
export async function getAcquisitionSummary(days = 30) {
  try {
    const { report, trackingHasData } = await getAcquisitionReport({ days, groupBy: "channel", touch: "first" });
    return {
      ok: true as const,
      trackingHasData,
      visitors: report.totals.visitors,
      signups: report.totals.signups,
      signupRate: report.totals.signupRate,
      untrackedSignups: report.totals.untrackedSignups,
      top: report.rows.filter((r) => r.signups > 0 || r.visitors > 0).slice(0, 5).map((r) => ({ key: r.key, visitors: r.visitors, signups: r.signups })),
      days,
    };
  } catch (err) {
    logger.warn({ err }, "acquisition summary unavailable");
    return { ok: false as const };
  }
}

export type Facets = { sources: string[]; mediums: string[]; campaigns: string[] };

/** Values actually seen recently, so the audience builder and promo form suggest real names (and admins stop inventing near-duplicates). */
export async function getFacets(): Promise<Facets> {
  try {
    const since = new Date(Date.now() - 180 * DAY);
    const [src, med, cam, uSrc, uCam] = await Promise.all([
      db.acquisitionVisit.groupBy({ by: ["source"], where: { createdAt: { gte: since }, source: { not: null } }, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 50 }),
      db.acquisitionVisit.groupBy({ by: ["medium"], where: { createdAt: { gte: since }, medium: { not: null } }, _count: { _all: true }, orderBy: { _count: { medium: "desc" } }, take: 30 }),
      db.acquisitionVisit.groupBy({ by: ["campaign"], where: { createdAt: { gte: since }, campaign: { not: null } }, _count: { _all: true }, orderBy: { _count: { campaign: "desc" } }, take: 50 }),
      db.userAttribution.groupBy({ by: ["source"], where: { source: { not: null } }, _count: { _all: true }, orderBy: { _count: { source: "desc" } }, take: 50 }),
      db.userAttribution.groupBy({ by: ["campaign"], where: { campaign: { not: null } }, _count: { _all: true }, orderBy: { _count: { campaign: "desc" } }, take: 50 }),
    ]);
    const uniq = (...lists: (string | null)[][]) => [...new Set(lists.flat().filter((x): x is string => !!x))];
    return {
      sources: uniq(src.map((r) => r.source), uSrc.map((r) => r.source)),
      mediums: uniq(med.map((r) => r.medium)),
      campaigns: uniq(cam.map((r) => r.campaign), uCam.map((r) => r.campaign)),
    };
  } catch (err) {
    logger.warn({ err }, "marketing facets unavailable");
    return { sources: [], mediums: [], campaigns: [] };
  }
}

export type AudienceMember = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
  plan: string;
  channel: string | null;
  source: string | null;
  campaign: string | null;
};

export type AudienceResult = {
  total: number;
  truncated: boolean;
  members: AudienceMember[];
  byPlan: { plan: string; count: number }[];
};

/**
 * Users matching a segment filter. Attribution/date filters run in the
 * database; plan is resolved with the same entitlement rules used app-wide and
 * applied after, so "Free" really means "no entitled paid subscription".
 */
export async function resolveAudience(filter: SegmentFilter): Promise<AudienceResult> {
  const rows = await db.user.findMany({
    where: segmentWhere(filter) as never,
    take: USER_CAP + 1,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      attribution: { select: attributionSelect },
      memberships: { where: { role: "owner" }, select: { org: { select: { subscription: { select: subSelect } } } } },
    },
  });
  const truncated = rows.length > USER_CAP;
  const members: AudienceMember[] = [];
  const byPlan = new Map<string, number>();
  for (const u of rows.slice(0, USER_CAP)) {
    const plan = effectivePlanKey(u.memberships.map((m) => m.org.subscription));
    if (!matchesPlan(filter, plan)) continue;
    byPlan.set(plan, (byPlan.get(plan) ?? 0) + 1);
    const last = filter.touch === "last";
    members.push({
      id: u.id,
      name: u.name,
      email: u.email,
      createdAt: u.createdAt,
      plan,
      channel: (last ? u.attribution?.lastChannel : u.attribution?.channel) ?? null,
      source: (last ? u.attribution?.lastSource : u.attribution?.source) ?? null,
      campaign: (last ? u.attribution?.lastCampaign : u.attribution?.campaign) ?? null,
    });
  }
  return {
    total: members.length,
    truncated,
    members,
    byPlan: [...byPlan.entries()].map(([plan, count]) => ({ plan, count })).sort((a, b) => b.count - a.count),
  };
}
