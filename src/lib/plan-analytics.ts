import { db } from "@/lib/db";
import { getPlans } from "@/lib/plans";

/**
 * Subscription / revenue analytics for /admin/plans. All aggregation in JS from
 * a bounded row set (admin data volumes are small).
 */

const DAY = 86_400_000;

export type PlanAnalytics = Awaited<ReturnType<typeof planAnalytics>>;

export async function planAnalytics() {
  const now = Date.now();
  const [plans, subs, audit, usage] = await Promise.all([
    getPlans(),
    db.subscription.findMany({
      include: { plan: { select: { key: true, name: true } } },
    }),
    // upgrades / downgrades / cancels come from the audit trail
    db.auditLog.findMany({
      where: {
        action: { in: ["billing.plan_changed", "admin.org_plan_set", "billing.canceled", "admin.subscription_status"] },
        createdAt: { gte: new Date(now - 180 * DAY) },
      },
      select: { action: true, createdAt: true, metadata: true },
      orderBy: { createdAt: "asc" },
    }),
    db.usageRecord.findMany({
      where: { periodMonth: new Date().toISOString().slice(0, 7) },
      select: { orgId: true, metric: true, value: true },
    }),
  ]);

  const planByKey = Object.fromEntries(plans.map((p) => [p.key, p]));
  const limitFor = (key: string, metric: string) => {
    const p = planByKey[key];
    if (!p) return 0;
    return metric === "channels" ? p.maxChannels
      : metric === "users" ? p.maxUsers
      : metric === "scheduled_posts" ? p.maxScheduled
      : metric === "ai_credits" ? p.aiCredits
      : metric === "storage_mb" ? p.storageMb
      : 0;
  };

  const active = subs.filter((s) => s.status === "active");
  const trialing = subs.filter((s) => s.status === "trialing");
  const pastDue = subs.filter((s) => s.status === "past_due");
  const canceled = subs.filter((s) => s.status === "canceled");

  const monthlyValue = (s: (typeof subs)[number]) => {
    const p = planByKey[s.plan.key];
    if (!p) return 0;
    return s.interval === "year" ? Math.round(p.priceAnnual / 12) : p.priceMonthly;
  };
  const mrr = [...active, ...trialing].reduce((sum, s) => sum + monthlyValue(s), 0);
  const arr = mrr * 12;

  // per-plan rollup
  const byPlan = plans.map((p) => {
    const mine = subs.filter((s) => s.plan.key === p.key);
    const act = mine.filter((s) => ["active", "trialing"].includes(s.status));
    return {
      key: p.key,
      name: p.name,
      priceMonthly: p.priceMonthly,
      total: mine.length,
      active: act.length,
      mrr: act.reduce((sum, s) => sum + monthlyValue(s), 0),
    };
  });

  // trial conversion: subs that ever had a trialEndsAt in the past and are now active
  const trialed = subs.filter((s) => s.trialEndsAt && s.trialEndsAt.getTime() < now);
  const trialConverted = trialed.filter((s) => s.status === "active").length;
  const trialConversionPct = trialed.length ? Math.round((trialConverted / trialed.length) * 100) : 0;

  // churn (last 30d): canceled in window / active-at-start-of-window
  const cancels30 = audit.filter(
    (a) => (a.action === "billing.canceled" || (a.action === "admin.subscription_status" && String(a.metadata).includes("canceled"))) &&
      a.createdAt.getTime() > now - 30 * DAY,
  ).length;
  const churnPct = active.length + cancels30 > 0 ? Math.round((cancels30 / (active.length + cancels30)) * 100) : 0;

  // movement series (6 months): upgrades vs downgrades vs cancels
  const months: { label: string; up: number; down: number; churn: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    idx.set(d.toISOString().slice(0, 7), months.length);
    months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), up: 0, down: 0, churn: 0 });
  }
  for (const a of audit) {
    const b = idx.get(a.createdAt.toISOString().slice(0, 7));
    if (b === undefined) continue;
    const meta = String(a.metadata ?? "");
    if (a.action === "billing.canceled" || meta.includes("canceled")) months[b].churn++;
    else if (meta.includes("downgrade")) months[b].down++;
    else months[b].up++;
  }

  // over-limit orgs
  const usageByOrg = new Map<string, Record<string, number>>();
  for (const u of usage) {
    const m = usageByOrg.get(u.orgId) ?? {};
    m[u.metric] = (m[u.metric] ?? 0) + u.value;
    usageByOrg.set(u.orgId, m);
  }
  const subByOrg = Object.fromEntries(subs.map((s) => [s.orgId, s.plan.key]));
  let overLimitOrgs = 0;
  const overLimitDetail: { metric: string; count: number }[] = [];
  const overCounts: Record<string, number> = {};
  for (const [orgId, m] of usageByOrg) {
    const key = subByOrg[orgId] ?? "free";
    let orgOver = false;
    for (const metric of ["channels", "users", "scheduled_posts", "ai_credits", "storage_mb"]) {
      const lim = limitFor(key, metric);
      if (lim > 0 && (m[metric] ?? 0) > lim) {
        orgOver = true;
        overCounts[metric] = (overCounts[metric] ?? 0) + 1;
      }
    }
    if (orgOver) overLimitOrgs++;
  }
  for (const [metric, count] of Object.entries(overCounts)) overLimitDetail.push({ metric, count });

  return {
    kpis: {
      activeSubs: active.length,
      trialing: trialing.length,
      pastDue: pastDue.length,
      canceled: canceled.length,
      mrr,
      arr,
      trialConversionPct,
      churnPct,
      overLimitOrgs,
    },
    byPlan,
    movement: months,
    overLimitDetail,
  };
}
