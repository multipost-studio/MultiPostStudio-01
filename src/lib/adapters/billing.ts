import { db } from "@/lib/db";
import { PLAN_CATALOG, type PlanKey } from "@/lib/constants";
import { logAudit } from "@/lib/events";
import { env, flags, appUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  createRazorpayPlan,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
} from "@/lib/adapters/razorpay";

/**
 * Billing. Real checkout + webhook-driven plan changes when a provider is
 * configured — Razorpay (RAZORPAY_KEY_ID) or Stripe (STRIPE_SECRET_KEY),
 * Razorpay winning if both are set. With neither, an internal confirm page
 * applies the plan directly so the flow stays demoable with no account.
 */
type BillingProviderIds = { customerId?: string; subscriptionId?: string; periodEnd?: Date };

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
 * Begin a plan change. Real mode → the provider's hosted checkout URL. Stub
 * mode → the internal confirm page. Returns the URL to redirect the user to.
 */
export async function startCheckout(
  orgId: string,
  email: string,
  planKey: PlanKey,
  interval: "month" | "year",
  // Real, independently-priced currency choice — NOT Razorpay's own
  // auto-convert-at-checkout ("pay in your local currency" widget), which
  // bakes in a ~3% FX markup. This picks the plan's own native INR price
  // (see PLAN_CATALOG.priceMonthlyInr/priceAnnualInr) so an Indian customer
  // pays a real local price with no conversion fee, same as a USD customer.
  billingCurrency: "usd" | "inr" = "usd",
): Promise<string> {
  if (!flags.realBilling) {
    return `/settings/billing/confirm?plan=${planKey}&interval=${interval}`;
  }
  const cat = PLAN_CATALOG.find((p) => p.key === planKey)!;
  const useInr = billingCurrency === "inr";
  const amount = useInr
    ? interval === "year" ? cat.priceAnnualInr : cat.priceMonthlyInr
    : interval === "year" ? cat.priceAnnual : cat.priceMonthly;

  if (flags.billingProvider === "razorpay") {
    // Free / custom plans have nothing to charge — apply immediately.
    if (amount <= 0) {
      await applyPlan(orgId, planKey, interval, undefined, undefined, "razorpay");
      return appUrl("/settings/billing?changed=1");
    }
    // ponytail: creates a fresh Razorpay plan per checkout (Razorpay has no
    // upsert). Harmless at low volume; dedupe via notes lookup if it matters.
    const plan = await createRazorpayPlan({ planKey, interval, amount, name: cat.name, currency: billingCurrency.toUpperCase() });
    const sub = await createRazorpaySubscription({
      planId: plan.id,
      totalCount: interval === "year" ? 10 : 120, // ~10 years of cycles
      notes: { orgId, planKey, interval },
    });
    return sub.short_url;
  }

  const s = (await stripe())!;

  const existing = await db.subscription.findUnique({ where: { orgId } });
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { creditBalance: true } });
  const custId = existing?.stripeCustomerId?.startsWith("cus_") ? existing.stripeCustomerId : undefined;

  // Percent-off coupon -> a one-off Stripe coupon attached to the session.
  const discounts: { coupon: string }[] = [];
  const pct = Math.max(0, Math.min(100, existing?.discountPct ?? 0));
  if (pct > 0) {
    try {
      const c = await s.coupons.create({ percent_off: pct, duration: "forever", name: existing?.couponCode ?? `${pct}% off` });
      discounts.push({ coupon: c.id });
    } catch (e) {
      logger.warn({ err: e, orgId }, "stripe coupon create failed");
    }
  }
  // Account credit -> negative customer balance transaction (Stripe applies it to the next invoice).
  if (custId && (org?.creditBalance ?? 0) > 0) {
    try {
      await s.customers.createBalanceTransaction(custId, { amount: -(org!.creditBalance), currency: "usd", description: "MultiPost Studio account credit" });
      await db.organization.update({ where: { id: orgId }, data: { creditBalance: 0 } });
    } catch (e) {
      logger.warn({ err: e, orgId }, "stripe balance credit failed");
    }
  }

  const session = await s.checkout.sessions.create({
    mode: "subscription",
    customer: custId,
    customer_email: custId ? undefined : email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          recurring: { interval: interval === "year" ? "year" : "month" },
          unit_amount: amount,
          product_data: { name: `MultiPost Studio ${cat.name}` },
        },
      },
    ],
    ...(discounts.length ? { discounts } : {}),
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
  providerIds?: BillingProviderIds,
  provider: "stub" | "stripe" | "razorpay" = flags.billingProvider,
) {
  const plan = await db.plan.findUnique({ where: { key: planKey } });
  if (!plan) throw new Error(`Unknown plan: ${planKey}`);

  const periodEnd = providerIds?.periodEnd ?? (() => {
    const d = new Date();
    d.setMonth(d.getMonth() + (interval === "year" ? 12 : 1));
    return d;
  })();

  const customerId = providerIds?.customerId ?? `cus_stub_${orgId.slice(0, 8)}`;
  const subscriptionId = providerIds?.subscriptionId ?? `sub_stub_${orgId.slice(0, 8)}`;

  const sub = await db.subscription.upsert({
    where: { orgId },
    create: {
      orgId,
      planId: plan.id,
      status: "active",
      interval,
      currentPeriodEnd: periodEnd,
      provider,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
    update: {
      planId: plan.id,
      status: "active",
      interval,
      currentPeriodEnd: periodEnd,
      canceledAt: null,
      provider,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
    },
  });

  // Mirror an invoice locally for the billing UI. In real mode Stripe/Razorpay
  // is the source of truth; its webhook fills the real line items — but we still
  // record the coupon discount + account-credit adjustments here so the UI and
  // the credit ledger stay correct regardless of provider.
  const catalog = PLAN_CATALOG.find((p) => p.key === planKey)!;
  const listAmount = interval === "year" ? catalog.priceAnnual : catalog.priceMonthly;
  const discountPct = Math.max(0, Math.min(100, sub.discountPct));
  const amount = Math.round(listAmount * (1 - discountPct / 100));
  if (amount > 0) {
    // Credit ledger + discount audit run for every provider so the balance and
    // history stay correct. The mirrored invoice row is only written in stub
    // mode — in real mode the provider webhook is the source of truth.
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { creditBalance: true } });
    const credit = Math.min(org?.creditBalance ?? 0, amount);
    if (credit > 0) {
      await db.organization.update({ where: { id: orgId }, data: { creditBalance: { decrement: credit } } });
      await logAudit({ orgId, actorId, action: "billing.credit_applied", targetType: "organization", targetId: orgId, metadata: { credit, invoiceAmount: amount - credit } });
    }
    if (discountPct > 0) {
      await logAudit({ orgId, actorId, action: "billing.discount_applied", targetType: "subscription", targetId: sub.id, metadata: { discountPct, listAmount, charged: amount - credit } });
    }
    if (!flags.realBilling) {
      const count = await db.invoice.count({ where: { orgId } });
      await db.invoice.create({
        data: {
          orgId,
          number: `MPS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
          amountDue: amount - credit,
          status: "paid",
          periodStart: new Date(),
          periodEnd,
        },
      });
    }
  }

  await logAudit({
    orgId,
    actorId,
    action: "billing.plan_changed",
    targetType: "subscription",
    targetId: sub.id,
    metadata: { planKey, interval },
  });

  // Referral conversion when the program rewards on first paid plan.
  if (planKey !== "free") {
    try {
      const { getSettings } = await import("@/lib/settings");
      if ((await getSettings()).referralTrigger === "paid_plan") {
        const { convertReferral } = await import("@/lib/referrals");
        const owner = await db.membership.findFirst({
          where: { orgId, role: { in: ["owner", "admin"] }, status: "active" },
          orderBy: { createdAt: "asc" },
          select: { userId: true },
        });
        if (owner) await convertReferral(owner.userId);
      }
    } catch (e) {
      logger.warn({ err: e, orgId }, "referral convert on paid plan failed");
    }
  }

  return sub;
}

export async function cancelSubscription(orgId: string, actorId?: string) {
  const current = await db.subscription.findUnique({ where: { orgId } });
  const subId = current?.stripeSubscriptionId;
  if (flags.realBilling && subId && subId.startsWith("sub_")) {
    try {
      if (current!.provider === "razorpay") {
        await cancelRazorpaySubscription(subId, true);
      } else if (current!.provider === "stripe") {
        const s = (await stripe())!;
        await s.subscriptions.update(subId, { cancel_at_period_end: true });
      }
    } catch (e) {
      logger.error({ err: e, orgId, provider: current!.provider }, "provider cancel failed");
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

export async function reactivateSubscription(orgId: string, actorId?: string) {
  const current = await db.subscription.findUnique({ where: { orgId } });
  if (!current) return null;
  const subId = current.stripeSubscriptionId;
  if (flags.realBilling && subId && subId.startsWith("sub_")) {
    try {
      if (current.provider === "stripe") {
        const s = (await stripe())!;
        await s.subscriptions.update(subId, { cancel_at_period_end: false });
      }
      // Razorpay has no un-cancel; a canceled subscription must be re-created at checkout.
    } catch (e) {
      logger.error({ err: e, orgId, provider: current.provider }, "provider reactivate failed");
    }
  }
  const sub = await db.subscription.update({
    where: { orgId },
    data: { status: "active", canceledAt: null },
  });
  await logAudit({ orgId, actorId, action: "billing.reactivated", targetType: "subscription", targetId: sub.id });
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
