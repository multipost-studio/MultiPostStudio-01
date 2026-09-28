import { db } from "@/lib/db";

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
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
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
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
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
    referrals,
    rewardAgg,
    recentSignups,
    recentEvents,
    recentAudit,
  ] = await Promise.all([
    db.user.count(),
    db.organization.count({ where: { deletedAt: null } }),
    db.workspace.count(),
    db.post.count(),
    db.subscription.findMany({
      // Egress: MRR math needs status/interval/prices only — same result,
      // never full subscription + plan rows.
      take: 5000,
      select: { status: true, interval: true, plan: { select: { name: true, priceMonthly: true, priceAnnual: true } } },
    }),
    db.supportTicket.count({ where: { status: { in: ["open", "pending"] } } }),
    db.user.findMany({ where: { createdAt: { gte: new Date(now - 30 * DAY) } }, take: 10000, select: { createdAt: true } }),
    db.post.findMany({
      where: { status: "published", publishedAt: { gte: new Date(now - 14 * DAY) } },
      take: 10000,
      select: { publishedAt: true },
    }),
    db.invoice.findMany({
      where: { status: "paid", createdAt: { gte: new Date(now - 183 * DAY) } },
      take: 5000,
      select: { amountDue: true, createdAt: true },
    }),
    db.usageRecord.findMany({
      where: { periodMonth: new Date().toISOString().slice(0, 7) },
      take: 5000,
      select: { metric: true, value: true },
    }),
    db.referral.findMany({ take: 5000, select: { status: true } }),
    db.referralReward.aggregate({ _sum: { aiCredits: true } }),
    db.user.findMany({ orderBy: { createdAt: "desc" }, take: 6, select: { name: true, email: true, createdAt: true } }),
    db.systemEvent.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.auditLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { actor: { select: { name: true } } },
    }),
  ]);

  const activeSubs = subs.filter((s) => s.status === "active");
  const mrr = activeSubs.reduce(
    (sum, s) => sum + (s.interval === "year" ? s.plan.priceAnnual / 12 : s.plan.priceMonthly),
    0,
  );

  const signupSeries = bucketDays(signupRows.map((r) => r.createdAt), 30);
  let running = users - signupRows.length;
  const growthSeries = signupSeries.map((b) => ({ label: b.label, value: (running += b.value) }));

  const publishSeries = bucketDays(
    publishedRows.map((r) => r.publishedAt).filter((d): d is Date => !!d),
    14,
  );

  const revenueSeries = bucketMonths(
    invoiceRows.map((r) => ({ at: r.createdAt, amount: r.amountDue / 100 })),
    6,
  );

  const planCounts = subs.reduce<Record<string, number>>((acc, s) => {
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
      openTickets,
      referralsTotal: referrals.length,
      referralsConverted: referrals.filter((r) => r.status === "converted").length,
      bonusCreditsIssued: rewardAgg._sum.aiCredits ?? 0,
      aiCreditsMonth: usageByMetric.ai_credits ?? 0,
      scheduledMonth: usageByMetric.scheduled_posts ?? 0,
    },
    signupSeries,
    growthSeries,
    publishSeries,
    revenueSeries,
    planDonut,
    usageByMetric,
    recentSignups: recentSignups.map((u) => ({ name: u.name, email: u.email, at: u.createdAt.toISOString() })),
    recentEvents: recentEvents.map((e) => ({
      id: e.id,
      level: e.level,
      source: e.source,
      message: e.message,
      at: e.createdAt.toISOString(),
    })),
    recentAudit: recentAudit.map((a) => ({
      id: a.id,
      action: a.action,
      actor: a.actor?.name ?? "system",
      at: a.createdAt.toISOString(),
    })),
  };
}
