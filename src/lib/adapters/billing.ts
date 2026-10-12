import { db } from "@/lib/db";
import { getPlan } from "@/lib/plans";
import { invalidateOrgPlan, liveGauge } from "@/lib/entitlements";
import { type PlanKey } from "@/lib/constants";
import { logAudit } from "@/lib/events";
import { env, flags, appUrl, isProduction } from "@/lib/env";
import { clampPct, describeSubscription, discounted, isSelfServePlan, planAmount, retirablePreviousSubscription } from "@/lib/billing-rules";
import { logger } from "@/lib/logger";
import { notifyPlanChanged, notifySubscriptionCanceled } from "@/lib/notifications/billing-notify";
import {
  createRazorpayPlan,
  createRazorpaySubscription,
  cancelRazorpaySubscription,
  listRazorpayInvoices,
} from "@/lib/adapters/razorpay";

/** An error whose message is safe and useful to show the customer as it is. */
export class BillingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingError";
  }
}

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
  // bakes in a ~3% FX markup. This picks the plan's own native INR price so an
  // Indian customer pays a real local price with no conversion fee.
  billingCurrency: "usd" | "inr" = "usd",
  actorId?: string,
): Promise<string> {
  // Read from the Plan table (getPlan falls back to PLAN_CATALOG when the row
  // is missing), NOT from the catalog directly. Reading the catalog here meant
  // an admin editing a price in /admin/plans changed what /pricing displayed
  // while the customer was still charged the old, hardcoded amount.
  const cat = await getPlan(planKey);
  // Whatever the provider, a customer may only switch to a plan that is theirs to
  // take: Free, or a public paid plan. A zero-priced plan that isn't Free
  // (Enterprise, custom) is arranged with our team and must never be granted here.
  if (!isSelfServePlan(cat)) {
    throw new BillingError(`${cat.name} is arranged with our team. Please contact us to set it up.`);
  }
  if (!flags.realBilling) {
    return `/settings/billing/confirm?plan=${planKey}&interval=${interval}`;
  }

  // Going back to Free: stop the paid subscription renewing (access continues to the end of the
  // period already paid for) instead of switching instantly and leaving the provider billing them.
  if (cat.key === "free") {
    const current = await db.subscription.findUnique({ where: { orgId } });
    if (current && retirablePreviousSubscription(current, "sub_next")) {
      await cancelSubscription(orgId, actorId);
    } else {
      await applyPlan(orgId, "free", interval, actorId, undefined, flags.billingProvider);
    }
    return appUrl("/settings/billing?changed=1");
  }
  const amount = planAmount(cat, interval, billingCurrency);
  // A paid plan with no price in this currency can't be bought in it. Previously a zero amount
  // fell through to "apply the plan immediately", i.e. a free upgrade.
  if (amount <= 0) throw new BillingError(`${cat.name} isn't available in that currency or billing interval.`);

  if (flags.billingProvider === "razorpay") {
    // A percent-off coupon the customer redeemed must change what Razorpay charges: its plans are fixed
    // amounts, so the discount goes into the plan we create (Stripe gets a coupon instead, below).
    const held = await db.subscription.findUnique({ where: { orgId }, select: { discountPct: true } });
    const charged = Math.max(100, discounted(amount, held?.discountPct));
    // ponytail: creates a fresh Razorpay plan per checkout (Razorpay has no
    // upsert). Harmless at low volume; dedupe via notes lookup if it matters.
    const plan = await createRazorpayPlan({ planKey, interval, amount: charged, name: cat.name, currency: billingCurrency.toUpperCase() });
    const sub = await createRazorpaySubscription({
      planId: plan.id,
      totalCount: interval === "year" ? 10 : 120, // ~10 years of cycles
      notes: { orgId, planKey, interval },
    });
    // NOT sub.short_url. Razorpay's hosted subscription page has no way back:
    // POST /v1/subscriptions accepts no callback_url or callback_method (see
    // razorpay.com/docs/api/payments/subscriptions/create-subscription-link),
    // so a customer who changes their mind is stranded on rzp.io with no
    // cancel and no back button. Our own page opens the same subscription in
    // Razorpay's Checkout modal, where dismissing it returns them here.
    return appUrl(`/settings/billing/checkout?sub=${encodeURIComponent(sub.id)}`);
  }

  const s = (await stripe())!;

  const existing = await db.subscription.findUnique({ where: { orgId } });
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { creditBalance: true } });
  const custId = existing?.stripeCustomerId?.startsWith("cus_") ? existing.stripeCustomerId : undefined;

  // Percent-off coupon -> a one-off Stripe coupon attached to the session.
  const discounts: { coupon: string }[] = [];
  const pct = clampPct(existing?.discountPct);
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

  const before = await db.subscription.findUnique({ where: { orgId }, select: { provider: true, stripeSubscriptionId: true, planId: true, interval: true } });

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

  // A plan change creates a brand-new provider subscription. The one it replaces must stop renewing,
  // or the customer is billed for both indefinitely. It is cancelled at the end of the period already
  // paid for, so nobody loses time they paid for. Failure here never fails the activation: it is
  // logged for follow-up, because the customer has paid and must get the plan.
  const retire = flags.realBilling ? retirablePreviousSubscription(before, providerIds?.subscriptionId) : null;
  if (retire) {
    try {
      if (retire.provider === "razorpay") await cancelRazorpaySubscription(retire.id, true);
      else await (await stripe())!.subscriptions.update(retire.id, { cancel_at_period_end: true });
      await logAudit({ orgId, actorId, action: "billing.previous_subscription_retired", targetType: "subscription", targetId: sub.id, metadata: { provider: retire.provider, retiredId: retire.id, replacedBy: providerIds?.subscriptionId } });
    } catch (e) {
      logger.error({ err: e, orgId, retiredId: retire.id, provider: retire.provider }, "could not retire the previous provider subscription: the customer may be double billed until it is cancelled by hand");
      await logAudit({ orgId, actorId, action: "billing.previous_subscription_retire_failed", targetType: "subscription", targetId: sub.id, metadata: { provider: retire.provider, retiredId: retire.id } }).catch(() => undefined);
    }
  }

  // Mirror an invoice locally for the billing UI (demo mode only). With a real provider Stripe/Razorpay
  // is the source of truth and its webhook fills the real invoices.
  // Use the Plan row resolved above, not a second lookup in PLAN_CATALOG.
  // The catalog only holds the built-in keys, so an admin-created custom plan
  // returned undefined and the non-null assertion turned that into a TypeError
  // mid-checkout. The DB row is authoritative and always present here.
  const listAmount = interval === "year" ? plan.priceAnnual : plan.priceMonthly;
  const discountPct = clampPct(sub.discountPct);
  const amount = discounted(listAmount, discountPct);
  // Account credit and the discount audit belong to demo mode only. This function runs for every
  // provider event (activation, each renewal, each subscription update), so with a real provider it
  // consumed the customer's credit over and over without that credit ever reaching a charge.
  // (Stripe moves credit into the customer balance at checkout; Razorpay plans are fixed amounts.)
  if (amount > 0 && !flags.realBilling) {
    const org = await db.organization.findUnique({ where: { id: orgId }, select: { creditBalance: true } });
    const credit = Math.min(org?.creditBalance ?? 0, amount);
    if (credit > 0) {
      await db.organization.update({ where: { id: orgId }, data: { creditBalance: { decrement: credit } } });
      await logAudit({ orgId, actorId, action: "billing.credit_applied", targetType: "organization", targetId: orgId, metadata: { credit, invoiceAmount: amount - credit } });
    }
    if (discountPct > 0) {
      await logAudit({ orgId, actorId, action: "billing.discount_applied", targetType: "subscription", targetId: sub.id, metadata: { discountPct, listAmount, charged: amount - credit } });
    }
    {
      // Invoice numbers are unique per org; concurrent checkouts race
      // count+1 into the same number. Retry with a recount instead of 500ing
      // a paid customer (P2002 converges on the next free number).
      for (let attempt = 0; attempt < 3; attempt++) {
        const count = await db.invoice.count({ where: { orgId } });
        try {
          const invoice = await db.invoice.create({
            data: {
              orgId,
              number: `MPS-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`,
              amountDue: amount - credit,
              status: "paid",
              periodStart: new Date(),
              periodEnd,
            },
          });
          const { generateCommissionForInvoice } = await import("@/lib/affiliates");
          await generateCommissionForInvoice(invoice.id).catch((e) =>
            logger.warn({ err: e, invoiceId: invoice.id }, "affiliate commission generation failed"),
          );
          break;
        } catch (e) {
          if ((e as { code?: string })?.code !== "P2002" || attempt === 2) throw e;
        }
      }
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

  // The plan cache lives 30s: without this a purchase/cancel shows the old
  // plan (and old gates) until it expires.
  invalidateOrgPlan(orgId);

  // Tell the owners, but only when something really changed: this runs on every renewal and update event too.
  if (!before || before.planId !== plan.id || before.interval !== interval) {
    await notifyPlanChanged(orgId, { planName: plan.name, interval, renewsOn: periodEnd, isNew: !before }).catch((e) =>
      logger.warn({ err: e, orgId }, "plan change notification failed"),
    );
  }

  return sub;
}

/**
 * Record, in our database only, that a subscription has been cancelled. Used by the provider's own
 * cancellation webhooks (the provider has already done it, so calling it again would only error).
 * Paid access continues until currentPeriodEnd (see isSubscriptionEntitled).
 */
export async function markSubscriptionCanceled(orgId: string, actorId?: string, opts: { endNow?: boolean; source?: string } = {}) {
  const sub = await db.subscription.update({
    where: { orgId },
    data: { status: "canceled", canceledAt: new Date(), ...(opts.endNow ? { currentPeriodEnd: new Date() } : {}) },
  });
  invalidateOrgPlan(orgId);
  await logAudit({ orgId, actorId, action: "billing.canceled", targetType: "subscription", targetId: sub.id, metadata: { source: opts.source ?? (actorId ? "customer" : "provider"), endedNow: !!opts.endNow } });
  // The customer who clicked Cancel knows; a cancellation from the provider side is news.
  if (!actorId) {
    await notifySubscriptionCanceled(orgId, { accessUntil: sub.currentPeriodEnd, endedNow: !!opts.endNow }).catch((e) =>
      logger.warn({ err: e, orgId }, "cancellation notification failed"),
    );
  }
  return sub;
}

/**
 * Customer-initiated cancellation: stop renewal at the provider first, and only record it locally
 * once that has worked. If the provider call fails the customer is told and nothing changes, rather
 * than showing "cancelled" while the provider carries on charging.
 */
export async function cancelSubscription(orgId: string, actorId?: string) {
  const current = await db.subscription.findUnique({ where: { orgId } });
  const subId = current?.stripeSubscriptionId;
  if (flags.realBilling && subId && subId.startsWith("sub_") && !subId.startsWith("sub_stub_")) {
    try {
      if (current!.provider === "razorpay") {
        await cancelRazorpaySubscription(subId, true);
      } else if (current!.provider === "stripe") {
        const s = (await stripe())!;
        await s.subscriptions.update(subId, { cancel_at_period_end: true });
      }
    } catch (e) {
      logger.error({ err: e, orgId, provider: current!.provider }, "provider cancel failed");
      throw new BillingError("We couldn't cancel with the payment provider just now, so nothing has changed. Please try again in a moment, or contact support.");
    }
  }
  return markSubscriptionCanceled(orgId, actorId, { source: "customer" });
}

/**
 * Undo a scheduled cancellation, only where the provider confirms the subscription is still alive.
 * Once it has ended there is nothing to resume and the customer must check out again: setting the
 * row back to "active" without a live, paid subscription would be a permanent free plan.
 */
export async function reactivateSubscription(orgId: string, actorId?: string) {
  const current = await db.subscription.findUnique({ where: { orgId }, include: { plan: { select: { key: true } } } });
  if (!current) return null;
  const subId = current.stripeSubscriptionId;
  const real = flags.realBilling && !!subId && subId.startsWith("sub_") && !subId.startsWith("sub_stub_");
  const restart = new BillingError("This subscription has already ended, so it can't be resumed. Choose a plan below to start a new one.");

  if (real) {
    if (current.provider === "stripe") {
      let live;
      try {
        const s = (await stripe())!;
        live = await s.subscriptions.retrieve(subId!);
      } catch (e) {
        logger.error({ err: e, orgId }, "provider reactivate lookup failed");
        throw new BillingError("We couldn't reach the payment provider just now. Please try again in a moment.");
      }
      if (live.status !== "active" && live.status !== "trialing") throw restart;
      try {
        const s = (await stripe())!;
        await s.subscriptions.update(subId!, { cancel_at_period_end: false });
      } catch (e) {
        logger.error({ err: e, orgId }, "provider reactivate failed");
        throw new BillingError("We couldn't resume the subscription with the payment provider, so nothing has changed.");
      }
    } else {
      // Razorpay has no un-cancel: a cancelled subscription is re-created at checkout.
      throw restart;
    }
  } else if (isProduction) {
    // No real subscription behind this row, and production has no demo path: resuming would grant a paid plan for nothing.
    throw restart;
  } else if (describeSubscription(current, current.plan.key).state === "expired") {
    // Demo mode keeps its no-payment reactivation, but never for a plan whose time has run out.
    throw restart;
  }

  const sub = await db.subscription.update({
    where: { orgId },
    data: { status: "active", canceledAt: null },
  });
  invalidateOrgPlan(orgId);
  await logAudit({ orgId, actorId, action: "billing.reactivated", targetType: "subscription", targetId: sub.id });
  return sub;
}

/** Current-month usage snapshot for meters. */
export async function getUsage(orgId: string) {
  const month = new Date().toISOString().slice(0, 7);
  const records = await db.usageRecord.findMany({ where: { orgId, periodMonth: month } });
  const map = Object.fromEntries(records.map((r) => [r.metric, r.value]));
  // Monthly counters come from the stored record; load-type gauges are counted from the real rows
  // (see liveGauge), so they don't read zero on the first of a month.
  const [channels, users, scheduled, storage] = await Promise.all([
    liveGauge(orgId, "channels").catch(() => map.channels ?? 0),
    liveGauge(orgId, "users").catch(() => map.users ?? 0),
    liveGauge(orgId, "scheduled_posts").catch(() => map.scheduled_posts ?? 0),
    liveGauge(orgId, "storage_mb").catch(() => map.storage_mb ?? 0),
  ]);
  return {
    month,
    ai_credits: map.ai_credits ?? 0,
    scheduled_posts: scheduled,
    storage_mb: storage,
    api_calls: map.api_calls ?? 0,
    channels,
    users,
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

/**
 * Counterpart to bumpUsage: UsageRecords are gauges of *current* load
 * (currently-scheduled posts, connected channels, stored MB, seats), not
 * lifetime totals — the dashboard's checkUsage reads them, and the schedule
 * gate enforces live counts, so the two must agree. Every decrement site
 * (unschedule, delete, disconnect, publish-terminal, member removal) calls
 * this; values floor at zero so a missed bump can never drive negative.
 */
export async function debumpUsage(orgId: string, metric: string, by = 1) {
  const periodMonth = new Date().toISOString().slice(0, 7);
  const rec = await db.usageRecord.findUnique({
    where: { orgId_metric_periodMonth: { orgId, metric, periodMonth } },
  });
  if (!rec) return;
  await db.usageRecord.update({
    where: { orgId_metric_periodMonth: { orgId, metric, periodMonth } },
    data: { value: Math.max(0, rec.value - by) },
  });
}

/**
 * Mirror Razorpay's own paid invoices for a subscription into the local
 * Invoice table, so /settings/billing can list receipts.
 *
 * This used to live inline in the Razorpay webhook, which meant a customer who
 * paid on a deployment with no webhook configured got the plan (via the
 * checkout confirmation) and no receipt at all — "No invoices yet" under a
 * subscription they had just paid for.
 *
 * Razorpay is the source of truth for the amount and for the billing period;
 * we never compute an amount from the catalog here, because a proration or an
 * offer would make that a wrong figure on a financial document. `pdfUrl` gets
 * Razorpay's hosted invoice, so the receipt route redirects to theirs.
 *
 * Safe to call repeatedly and from both paths: an invoice already mirrored for
 * the same org and billing period is skipped, and a racing insert loses on the
 * unique invoice number rather than duplicating.
 */
export async function mirrorRazorpayInvoices(orgId: string, subscriptionId: string): Promise<number> {
  let invoices: Awaited<ReturnType<typeof listRazorpayInvoices>>;
  try {
    invoices = await listRazorpayInvoices(subscriptionId);
  } catch (err) {
    // A missing receipt must never fail the thing that granted the plan.
    logger.error({ err, subscriptionId }, "could not list Razorpay invoices");
    return 0;
  }

  let created = 0;
  for (const inv of invoices) {
    if (inv.status !== "paid") continue;
    const periodStart = inv.billing_start ? new Date(inv.billing_start * 1000) : new Date();
    const periodEnd = inv.billing_end ? new Date(inv.billing_end * 1000) : periodStart;

    const existing = await db.invoice.findFirst({
      where: { orgId, periodStart, periodEnd, amountDue: inv.amount_paid ?? inv.amount },
      select: { id: true },
    });
    if (existing) continue;

    // Numbers are unique, so two receipts created at once can pick the same one. Recount and retry
    // rather than dropping the receipt a customer is owed.
    for (let attempt = 0; attempt < 4; attempt++) {
      const count = await db.invoice.count({ where: { orgId } });
      try {
        const saved = await db.invoice.create({
          data: {
            orgId,
            number: `MPS-${new Date().getFullYear()}-${String(count + 1 + attempt).padStart(4, "0")}`,
            amountDue: inv.amount_paid ?? inv.amount,
            currency: inv.currency.toLowerCase(),
            status: "paid",
            periodStart,
            periodEnd,
            pdfUrl: inv.short_url ?? null,
            provider: "razorpay",
            providerInvoiceId: inv.id,
            providerPaymentId: inv.payment_id ?? null,
          },
        });
        created++;
        const { generateCommissionForInvoice } = await import("@/lib/affiliates");
        await generateCommissionForInvoice(saved.id).catch((e) =>
          logger.warn({ err: e, invoiceId: saved.id }, "affiliate commission generation failed"),
        );
        break;
      } catch (err) {
        if ((err as { code?: string })?.code === "P2002" && attempt < 3) continue;
        logger.warn({ err, orgId, invoiceId: inv.id }, "invoice mirror skipped");
        break;
      }
    }
  }
  return created;
}
