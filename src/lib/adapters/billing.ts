import { db } from "@/lib/db";
import { PLAN_CATALOG, type PlanKey } from "@/lib/constants";
import { logAudit } from "@/lib/events";
import { env, flags, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Billing. Real Stripe Checkout + webhook-driven plan changes when
 * STRIPE_SECRET_KEY is set; otherwise an internal confirm page applies the plan
 * directly so the flow stays demoable with no Stripe account.
 */

let _stripe: import("stripe").default | null = null;
export async function stripe() {
  if (!flags.realBilling) return null;
  if (!_stripe) {
    const Stripe = (await import("stripe")).default;
    _stripe = new Stripe(env.STRIPE_SECRET_KEY!, { apiVersion: "2025-08-27.basil" as never });
  }
  return _stripe;
}

/**
 * Begin a plan change. Real mode → a Stripe Checkout URL. Stub mode → the
 * internal confirm page. Returns the URL to redirect the user to.
 */
export async function startCheckout(
  orgId: string,
  email: string,
  planKey: PlanKey,
  interval: "month" | "year",
): Promise<string> {
  if (!flags.realBilling) {
    return `/settings/billing/confirm?plan=${planKey}&interval=${interval}`;
  }
  const s = (await stripe())!;
  const cat = PLAN_CATALOG.find((p) => p.key === planKey)!;
  const amount = interval === "year" ? cat.priceAnnual : cat.priceMonthly;

  const existing = await db.subscription.findUnique({ where: { orgId } });
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: existing?.stripeCustomerId?.startsWith("cus_") ? existing.stripeCustomerId : undefined,
    customer_email: existing?.stripeCustomerId?.startsWith("cus_") ? undefined : email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          recurring: { interval: interval === "year" ? "year" : "month" },
          unit_amount: amount,
          product_data: { name: `Cadence ${cat.name}` },
        },
      },
    ],
    metadata: { orgId, planKey, interval },
    subscription_data: { metadata: { orgId, planKey, interval } },
    success_url: appUrl("/settings/billing?changed=1"),
    cancel_url: appUrl("/settings/billing"),
  });
  return session.url ?? appUrl("/settings/billing");
}

export async function applyPlan(
  orgId: string,
  planKey: PlanKey,
  interval: "month" | "year",
  actorId?: string,
  stripeIds?: { customerId?: string; subscriptionId?: string; periodEnd?: Date },
) {
  const plan = await db.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  const periodEnd = stripeIds?.periodEnd ?? (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + (interval === "year" ? 12 : 1));
    return d;
  })();

  const customerId = stripeIds?.customerId ?? `cus_stub_${orgId.slice(0, 8)}`;
  const subscriptionId = stripeIds?.subscriptionId ?? `sub_stub_${orgId.slice(0, 8)}`;

  const sub = await db.subscription.upsert({
    where: { orgId },
    create: {
      orgId,
      planId: plan.id,
      status: "active",
      interval,
      currentPeriodEnd: periodEnd,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
    update: {
      planId: plan.id,
      status: "active",
      interval,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
  });

  // Mirror an invoice locally for the billing UI. In real mode Stripe is the
  // source of truth and its invoice.paid webhook would populate this instead.
  const catalog = PLAN_CATALOG.find((p) => p.key === planKey)!;
  const amount = interval === "year" ? catalog.priceAnnual : catalog.priceMonthly;
  if (amount > 0 && !flags.realBilling) {
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
  const current = await db.subscription.findUnique({ where: { orgId } });
  if (flags.realBilling && current?.stripeSubscriptionId?.startsWith("sub_")) {
    try {
      const s = (await stripe())!;
      await s.subscriptions.update(current.stripeSubscriptionId, { cancel_at_period_end: true });
    } catch (e) {
      logger.error({ err: e, orgId }, "stripe cancel failed");
    }
  }
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
