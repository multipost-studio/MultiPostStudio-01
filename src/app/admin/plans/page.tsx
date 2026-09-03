import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getPlans } from "@/lib/plans";
import { planAnalytics } from "@/lib/plan-analytics";
import { parseJson, formatCurrency, formatNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Stat } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Bars, MultiLine, CHART_COLORS } from "@/components/charts";
import { PlanEditorPro, SeedPlansButton, NewPlanButton, type AdminPlan } from "./plans-client";

export const metadata: Metadata = { title: "Admin · Plans" };

export default async function AdminPlansPage() {
  const [rows, a, catalog] = await Promise.all([
    db.plan.findMany({ orderBy: { sortIndex: "asc" }, include: { _count: { select: { subscriptions: true } } } }),
    planAnalytics(),
    getPlans(),
  ]);

  const seeded = rows.length > 0;

  const plans: AdminPlan[] = rows.map((r) => ({
    id: r.id,
    key: r.key,
    name: r.name,
    badge: r.badge ?? null,
    currency: r.currency,
    priceMonthly: r.priceMonthly,
    priceAnnual: r.priceAnnual,
    annualDiscountPct: r.annualDiscountPct,
    trialDays: r.trialDays,
    maxChannels: r.maxChannels,
    maxUsers: r.maxUsers,
    maxScheduled: r.maxScheduled,
    aiCredits: r.aiCredits,
    storageMb: r.storageMb,
    analyticsRetentionDays: r.analyticsRetentionDays,
    apiRateLimit: r.apiRateLimit,
    automationLimit: r.automationLimit,
    features: parseJson<string[]>(r.features, []),
    entitlements: parseJson<string[]>(r.entitlements, []),
    isPublic: r.isPublic,
    isCustom: r.isCustom,
    sortIndex: r.sortIndex,
    subscriberCount: r._count.subscriptions,
  }));

  const subsByPlan = a.byPlan.map((p) => ({ label: p.name, value: p.active }));
  const mrrByPlan = a.byPlan.map((p) => ({ label: p.name, value: Math.round(p.mrr / 100) }));
  const movement = a.movement.map((m) => ({ label: m.label, up: m.up, down: m.down, churn: m.churn }));
  const movementLines = [
    { key: "up", label: "Upgrades", color: CHART_COLORS[4] },
    { key: "down", label: "Downgrades", color: CHART_COLORS[5] },
    { key: "churn", label: "Churn", color: CHART_COLORS[0] },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Plans &amp; subscriptions</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Pricing, limits and feature entitlements — edits go live everywhere (pricing page, checkout, feature gates) with no deploy.
          </p>
        </div>
        {seeded && <NewPlanButton />}
      </div>

      {!seeded && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-6">
            <p className="text-[15px] font-semibold text-[var(--text)]">No plans in the database yet</p>
            <p className="text-[14px] text-[var(--text-muted)]">
              The app is currently serving the built-in catalog as a fallback. Seed it into the database to make plans
              editable here and to enable per-plan analytics.
            </p>
            <SeedPlansButton />
          </CardContent>
        </Card>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Active subs" value={formatNumber(a.kpis.activeSubs)} />
        <Stat label="MRR" value={formatCurrency(a.kpis.mrr)} />
        <Stat label="ARR" value={formatCurrency(a.kpis.arr)} />
        <Stat label="Trialing" value={a.kpis.trialing} />
        <Stat label="Past due" value={a.kpis.pastDue} />
        <Stat label="Trial → paid" value={`${a.kpis.trialConversionPct}%`} />
      </div>
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Churn (30d)" value={`${a.kpis.churnPct}%`} />
        <Stat label="Canceled" value={a.kpis.canceled} />
        <Stat label="Over-limit orgs" value={a.kpis.overLimitOrgs} />
      </div>

      {/* charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Active subscriptions by plan</CardTitle></CardHeader>
          <CardContent><Bars data={subsByPlan} dataKey="value" /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>MRR by plan ({catalog[0]?.currency.toUpperCase() ?? "USD"})</CardTitle></CardHeader>
          <CardContent><Bars data={mrrByPlan} dataKey="value" color={CHART_COLORS[5]} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Plan movement · 6 months</CardTitle></CardHeader>
          <CardContent>
            <MultiLine data={movement} lines={movementLines} />
          </CardContent>
        </Card>
      </div>

      {a.overLimitDetail.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Orgs exceeding plan limits</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {a.overLimitDetail.map((d) => (
              <Badge key={d.metric} tone="danger">{d.metric.replace(/_/g, " ")}: {d.count}</Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* editors */}
      {seeded && (
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Plan configuration</h2>
          <div className="space-y-3">
            {plans.map((p) => (
              <PlanEditorPro key={p.id} plan={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
