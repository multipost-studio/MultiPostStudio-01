import { db } from "@/lib/db";
import { isSubscriptionEntitled } from "@/lib/entitlements-pure";
import { subscriptionMrr } from "@/lib/mrr";
import { groupAuditActions, groupSystemEvents } from "@/lib/activity-feed";

/**
 * Platform-wide analytics for /admin. All bucketing is done in JS from raw
 * rows (admin data volumes are small) so there's no raw SQL to maintain.
 */

const DAY = 86_400_000;

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}
function dayLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function monthKey(d: Date) {
  return d.toISOString().slice(0, 7);
}
function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

function bucketDays(dates: Date[], days: number) {
  const now = Date.now();
  const buckets: { label: string; value: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * DAY);
    idx.set(dayKey(d), buckets.length);
    buckets.push({ label: dayLabel(d), value: 0 });
  }
  for (const d of dates) {
    const b = idx.get(dayKey(d));
    if (b !== undefined) buckets[b].value++;
  }
  return buckets;
}

/**
 * Percent change between the sum of the last `n` buckets and the `n` before
 * them. Returns null (not 0) when there's nothing to compare against — a
 * fabricated "0%" would claim "no change" when the real answer is "no prior
 * data", and a delta from a zero baseline is undefined, not infinite or 0.
 */
function periodDelta(series: { value: number }[], n: number): number | null {
  if (series.length < n * 2) return null;
  const recent = series.slice(-n).reduce((s, b) => s + b.value, 0);
  const prior = series.slice(-n * 2, -n).reduce((s, b) => s + b.value, 0);
  if (prior === 0) return recent > 0 ? null : null; // no fabricated "up from zero" percentage
  return ((recent - prior) / prior) * 100;
}

function bucketMonths(rows: { at: Date; amount: number }[], months: number) {
  const now = new Date();
  const buckets: { label: string; value: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = months - 1; i >= 0; i--) {
    // UTC throughout: monthKey() reads the ISO (UTC) string, so building the
    // bucket at local midnight put it in the previous month on servers east of UTC.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    idx.set(monthKey(d), buckets.length);
    buckets.push({ label: monthLabel(d), value: 0 });
  }
  for (const r of rows) {
    const b = idx.get(monthKey(r.at));
    if (b !== undefined) buckets[b].value += r.amount;
  }
  return buckets;
}

export async function adminAnalytics() {
  const now = Date.now();
  const [
    users,
    orgs,
    workspaces,
    postsTotal,
    subs,
    openTickets,
    signupRows,
    publishedRows,
    invoiceRows,
    monthUsage,
    affiliates,
    affiliateConversions,
    commissionAgg,
    recentSignups,
    recentEvents,
    recentAudit,
  ] = await Promise.all([
    // Deleted accounts are not users: counting them inflated the headline and the growth curve.
    db.user.count({ where: { deletedAt: null } }),
    db.organization.count({ where: { deletedAt: null } }),
    db.workspace.count(),
    db.post.count(),
    db.subscription.findMany({
      // Egress: MRR math needs status/interval/prices only — same result,
      // never full subscription + plan rows.
      take: 5000,
      select: {
        status: true,
        interval: true,
        provider: true,
        discountPct: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        canceledAt: true,
        plan: { select: { name: true, priceMonthly: true, priceAnnual: true, priceMonthlyInr: true, priceAnnualInr: true } },
      },
    }),
    db.supportTicket.count({ where: { status: { in: ["open", "pending"] } } }),
    db.user.findMany({ where: { deletedAt: null, createdAt: { gte: new Date(now - 30 * DAY) } }, take: 10000, select: { createdAt: true } }),
    db.post.findMany({
      where: { status: "published", publishedAt: { gte: new Date(now - 14 * DAY) } },
      take: 10000,
      select: { publishedAt: true },
    }),
    db.invoice.findMany({
      where: { status: "paid", createdAt: { gte: new Date(now - 183 * DAY) } },
      take: 5000,
      select: { amountDue: true, currency: true, createdAt: true },
    }),
    db.usageRecord.findMany({
      where: { periodMonth: new Date().toISOString().slice(0, 7) },
      take: 5000,
      select: { metric: true, value: true },
    }),
    db.affiliate.count(),
    db.affiliateConversion.count(),
    db.affiliateCommission.aggregate({ _sum: { amountMinor: true } }),
    db.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 5, select: { name: true, email: true, createdAt: true } }),
    // A wider window than the card shows, so repeats can be collapsed into counts and the card still lists distinct events.
    db.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 40, select: { id: true, level: true, source: true, message: true, createdAt: true } }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true } } },
    }),
  ]);

  // Same definitions as the acquisition report (src/lib/mrr.ts): active only, annual
  // spread over 12 months, the subscription's own discount applied, and USD and
  // INR kept apart instead of being added together as if they were one currency.
  const activeSubs = subs.filter((s) => s.status === "active" && isSubscriptionEntitled(s));
  const mrrTotals = activeSubs.reduce((acc, s) => {
    const m = subscriptionMrr(s);
    return { usd: acc.usd + m.usd, inr: acc.inr + m.inr };
  }, { usd: 0, inr: 0 });
  const mrr = mrrTotals.usd;

  const signupSeries = bucketDays(signupRows.map((r) => r.createdAt), 30);
  let running = users - signupRows.length;
  const growthSeries = signupSeries.map((b) => ({ label: b.label, value: (running += b.value) }));

  const publishSeries = bucketDays(
    publishedRows.map((r) => r.publishedAt).filter((d): d is Date => !!d),
    14,
  );

  // Invoices carry their own currency; summing USD cents and INR paise together was wrong.
  const revenueSeries = bucketMonths(
    invoiceRows.filter((r) => r.currency.toLowerCase() !== "inr").map((r) => ({ at: r.createdAt, amount: r.amountDue / 100 })),
    6,
  );
  const revenueSeriesInr = bucketMonths(
    invoiceRows.filter((r) => r.currency.toLowerCase() === "inr").map((r) => ({ at: r.createdAt, amount: r.amountDue / 100 })),
    6,
  );

  // Only subscriptions that currently grant access: canceled/expired ones are not "on" a plan.
  const planCounts = subs.filter((s) => isSubscriptionEntitled(s)).reduce<Record<string, number>>((acc, s) => {
    acc[s.plan.name] = (acc[s.plan.name] ?? 0) + 1;
    return acc;
  }, {});
  const planDonut = Object.entries(planCounts).map(([name, value]) => ({ name, value }));

  const usageByMetric = monthUsage.reduce<Record<string, number>>((acc, u) => {
    acc[u.metric] = (acc[u.metric] ?? 0) + u.value;
    return acc;
  }, {});

  return {
    deltas: {
      // Signups this week vs the week before, from the same 30-day series
      // already fetched for the chart — no extra query.
      users: periodDelta(signupSeries, 7),
      // 14-day publish series is exactly two 7-day windows.
      posts: periodDelta(publishSeries, 7),
      // Last completed month vs the one before it — the current month is
      // still in progress in revenueSeries's final bucket, so comparing it
      // directly would read as a decline for most of every month regardless
      // of actual trend. Drop it before comparing.
      revenue: periodDelta(revenueSeries.slice(0, -1), 1),
    },
    stats: {
      users,
      orgs,
      workspaces,
      postsTotal,
      activeSubs: activeSubs.length,
      mrr,
      mrrInr: mrrTotals.inr,
      openTickets,
      affiliatesTotal: affiliates,
      affiliateConversions,
      commissionsIssuedMinor: commissionAgg._sum.amountMinor ?? 0,
      aiCreditsMonth: usageByMetric.ai_credits ?? 0,
      scheduledMonth: usageByMetric.scheduled_posts ?? 0,
    },
    signupSeries,
    growthSeries,
    publishSeries,
    revenueSeries,
    revenueSeriesInr,
    planDonut,
    usageByMetric,
    recentSignups: recentSignups.map((u) => ({ name: u.name, email: u.email, at: u.createdAt.toISOString() })),
    recentEvents: groupSystemEvents(recentEvents, 5),
    recentAudit: groupAuditActions(
      recentAudit.map((a) => ({ id: a.id, action: a.action, actor: a.actor?.name ?? "system", createdAt: a.createdAt })),
      5,
    ),
  };
}
