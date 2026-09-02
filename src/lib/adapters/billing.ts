import { db } from "@/lib/db";
import { PLAN_CATALOG, type PlanKey } from "@/lib/constants";
import { logAudit } from "@/lib/events";

/**
 * Stub billing. `startCheckout` returns an internal success URL instead of a
 * Stripe Checkout session. `applyPlan` performs the plan change directly.
 * Swap for Stripe: create Checkout Session, handle the webhook, then call applyPlan.
 */

export function startCheckout(planKey: PlanKey, interval: "month" | "year") {
  return `/settings/billing/confirm?plan=${planKey}&interval=${interval}`;
}

export async function applyPlan(
  orgId: string,
  planKey: PlanKey,
  interval: "month" | "year",
  actorId?: string,
) {
  const plan = await db.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  const periodEnd = new Date();
  periodEnd.setMonth(periodEnd.getMonth() + (interval === "year" ? 12 : 1));

  const sub = await db.subscription.upsert({
    where: { orgId },
    create: {
      orgId,
      planId: plan.id,
      status: "active",
      interval,
      currentPeriodEnd: periodEnd,
      stripeCustomerId: `cus_stub_${orgId.slice(0, 8)}`,
      stripeSubscriptionId: `sub_stub_${orgId.slice(0, 8)}`,
    },
    update: {
      planId: plan.id,
      status: "active",
      interval,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
    },
  });

  // Issue an invoice for paid plans.
  const catalog = PLAN_CATALOG.find((p) => p.key === planKey)!;
  const amount = interval === "year" ? catalog.priceAnnual : catalog.priceMonthly;
  if (amount > 0) {
    const count = await db.invoice.count({ where: { orgId } });
    await db.invoice.create({
      data: {
        orgId,
        number: `CAD-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
        amountDue: amount,
        status: "paid",
        periodStart: new Date(),
        periodEnd,
      },
    });
  }

  await logAudit({
    orgId,
    actorId,
    action: "billing.plan_changed",
    targetType: "subscription",
    targetId: sub.id,
    metadata: { planKey, interval },
  });

  return sub;
}

export async function cancelSubscription(orgId: string, actorId?: string) {
  const sub = await db.subscription.update({
    where: { orgId },
    data: { status: "canceled", canceledAt: new Date() },
  });
  await logAudit({
    orgId,
    actorId,
    action: "billing.canceled",
    targetType: "subscription",
    targetId: sub.id,
  });
  return sub;
}

/** Current-month usage snapshot for meters. */
export async function getUsage(orgId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const records = await db.usageRecord.findMany({ where: { orgId, periodMonth: month } });
  const map = Object.fromEntries(records.map((r) => [r.metric, r.value]));
  return {
    month,
    ai_credits: map.ai_credits ?? 0,
    scheduled_posts: map.scheduled_posts ?? 0,
    storage_mb: map.storage_mb ?? 0,
    api_calls: map.api_calls ?? 0,
    channels: map.channels ?? 0,
    users: map.users ?? 0,
  };
}

export async function bumpUsage(orgId: string, metric: string, by = 1) {
  const periodMonth = new Date().toISOString().slice(0, 7);
  await db.usageRecord.upsert({
    where: { orgId_metric_periodMonth: { orgId, metric, periodMonth } },
    create: { orgId, metric, periodMonth, value: by },
    update: { value: { increment: by } },
  });
}
