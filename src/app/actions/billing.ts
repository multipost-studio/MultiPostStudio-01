"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLAN_CATALOG, PLAN_KEYS, type PlanKey } from "@/lib/constants";
import { requireWorkspace } from "@/lib/session";
import { assertPermission } from "@/lib/rbac";
import {
  startCheckout,
  applyPlan,
  cancelSubscription,
  reactivateSubscription,
  mirrorRazorpayInvoices,
} from "@/lib/adapters/billing";
import { getRazorpaySubscription } from "@/lib/adapters/razorpay";
import { logger } from "@/lib/logger";
import { flags, isProduction } from "@/lib/env";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { z } from "zod";

export async function startCheckoutAction(planKey: string, interval: "month" | "year", billingCurrency: "usd" | "inr" = "usd") {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage"); // org-scoped, not workspace role
  if (!PLAN_KEYS.includes(planKey as PlanKey)) return;
  const url = await startCheckout(ctx.active.org.id, ctx.user.email, planKey as PlanKey, interval, billingCurrency);
  redirect(url);
}

export async function confirmPlanChangeAction(planKey: string, interval: "month" | "year") {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage"); // org-scoped, not workspace role
  if (!PLAN_KEYS.includes(planKey as PlanKey)) return { ok: false, error: "Unknown plan" };

  // This is a server action, so it's directly callable regardless of which
  // page rendered it — it must never be the way a paid plan gets applied when
  // a real billing provider is configured. `/settings/billing/confirm` only
  // exists as `startCheckout`'s no-payment fallback (no provider set), so
  // require that same condition here too: real billing off, or the plan is
  // actually free at this interval. Anything else must go through
  // `startCheckoutAction` → the provider's real, paid checkout.
  const cat = PLAN_CATALOG.find((p) => p.key === planKey);
  const amount = cat ? (interval === "year" ? cat.priceAnnual : cat.priceMonthly) : 0;
  if (flags.realBilling && amount > 0) {
    return { ok: false, error: "Start checkout to change to a paid plan" };
  }
  // Fail closed in production. `flags.realBilling` is false whenever no Stripe
  // or Razorpay keys are configured, which is a deployment mistake, not a
  // pricing decision — and the check above then lets anyone with billing
  // permission grant their own org the top plan for nothing. In production a
  // paid plan requires a payment provider; without one, upgrading is simply
  // unavailable. Dev and demo keep the no-payment path.
  if (isProduction && amount > 0) {
    return {
      ok: false,
      error: "Paid plans are unavailable right now — no payment provider is configured. Please contact support.",
    };
  }

  await applyPlan(ctx.active.org.id, planKey as PlanKey, interval, ctx.user.id);
  revalidatePath("/settings/billing");
  redirect("/settings/billing?changed=1");
}

export async function cancelSubscriptionAction() {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage"); // org-scoped, not workspace role
  await cancelSubscription(ctx.active.org.id, ctx.user.id);
  revalidatePath("/settings/billing");
  return { ok: true, message: "Subscription cancelled — active until period end" };
}

export async function reactivateSubscriptionAction() {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage");
  const sub = await reactivateSubscription(ctx.active.org.id, ctx.user.id);
  revalidatePath("/settings/billing");
  return sub
    ? { ok: true, message: "Subscription reactivated" }
    : { ok: false, error: "No subscription to reactivate — pick a plan instead" };
}

const billingDetailsSchema = z.object({
  billingName: z.string().max(120).optional(),
  billingEmail: z.string().email().max(160).or(z.literal("")).optional(),
  billingAddress: z.string().max(400).optional(),
  billingCountry: z.string().max(60).optional(),
  taxId: z.string().max(60).optional(),
});

export async function redeemCouponAction(codeRaw: string) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage");
  const code = String(codeRaw).trim().toUpperCase();
  if (!code) return { ok: false, error: "Enter a code" };

  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon || !coupon.active) return { ok: false, error: "That code isn't valid" };
  if (coupon.expiresAt && coupon.expiresAt.getTime() < Date.now()) return { ok: false, error: "That code has expired" };
  if (coupon.maxRedemptions > 0 && coupon.redeemedCount >= coupon.maxRedemptions) {
    return { ok: false, error: "That code has been fully redeemed" };
  }
  const already = await db.couponRedemption.findUnique({
    where: { couponId_orgId: { couponId: coupon.id, orgId: ctx.active.org.id } },
  });
  if (already) return { ok: false, error: "This code has already been used on your account" };

  // Claim one redemption atomically: the increment only lands while the count
  // is still below the cap, so two concurrent redeems can't both slip past the
  // read-only check above. Returns false when the code just filled up.
  const cpn = coupon;
  async function claimRedemption(tx: Parameters<Parameters<typeof db.$transaction>[0]>[0]): Promise<boolean> {
    if (cpn.maxRedemptions <= 0) {
      await tx.coupon.update({ where: { id: cpn.id }, data: { redeemedCount: { increment: 1 } } });
      return true;
    }
    const claimed = await tx.coupon.updateMany({
      where: { id: cpn.id, redeemedCount: { lt: cpn.maxRedemptions } },
      data: { redeemedCount: { increment: 1 } },
    });
    return claimed.count === 1;
  }

  if (coupon.percentOff > 0) {
    const sub = await db.subscription.findUnique({ where: { orgId: ctx.active.org.id } });
    if (!sub || sub.status === "canceled") {
      return { ok: false, error: "Start a paid plan first — then this discount applies to every invoice" };
    }
    const applied = await db.$transaction(async (tx) => {
      if (!(await claimRedemption(tx))) return false;
      await tx.couponRedemption.create({ data: { couponId: coupon.id, orgId: ctx.active.org.id, userId: ctx.user.id, amount: 0 } });
      await tx.subscription.update({ where: { orgId: ctx.active.org.id }, data: { couponCode: coupon.code, discountPct: Math.min(100, coupon.percentOff) } });
      return true;
    });
    if (!applied) return { ok: false, error: "That code has just been fully redeemed" };
    await logAudit({
      orgId: ctx.active.org.id, actorId: ctx.user.id, action: "billing.coupon_redeemed",
      targetType: "coupon", targetId: coupon.code, metadata: { percentOff: coupon.percentOff },
    });
    revalidatePath("/settings/billing");
    return { ok: true, message: `Applied — ${coupon.percentOff}% off every invoice` };
  }

  if (coupon.amountOff <= 0) return { ok: false, error: "This code can't be redeemed here" };

  const credited = await db.$transaction(async (tx) => {
    if (!(await claimRedemption(tx))) return false;
    await tx.couponRedemption.create({
      data: { couponId: coupon.id, orgId: ctx.active.org.id, userId: ctx.user.id, amount: coupon.amountOff },
    });
    await tx.organization.update({ where: { id: ctx.active.org.id }, data: { creditBalance: { increment: coupon.amountOff } } });
    return true;
  });
  if (!credited) return { ok: false, error: "That code has just been fully redeemed" };
  await logAudit({
    orgId: ctx.active.org.id,
    actorId: ctx.user.id,
    action: "billing.coupon_redeemed",
    targetType: "coupon",
    targetId: coupon.code,
    metadata: { amountOff: coupon.amountOff },
  });
  revalidatePath("/settings/billing");
  return { ok: true, message: `Applied — ${(coupon.amountOff / 100).toFixed(2)} ${coupon.currency.toUpperCase()} credit added` };
}

export async function updateBillingDetailsAction(input: z.infer<typeof billingDetailsSchema>) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage");
  const parsed = billingDetailsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the billing fields (email must be valid)" };
  const d = parsed.data;
  await db.organization.update({
    where: { id: ctx.active.org.id },
    data: {
      billingName: d.billingName?.trim() || null,
      billingEmail: d.billingEmail?.trim() || null,
      billingAddress: d.billingAddress?.trim() || null,
      billingCountry: d.billingCountry?.trim() || null,
      taxId: d.taxId?.trim() || null,
    },
  });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "billing.details_updated", targetType: "organization", targetId: ctx.active.org.id });
  revalidatePath("/settings/billing");
  return { ok: true, message: "Billing details saved" };
}

/**
 * Activate a Razorpay subscription the customer just paid for.
 *
 * The webhook is the durable path, but it is a separate manual setup in the
 * Razorpay dashboard and it can be delayed or missing entirely — a test
 * payment succeeded, no webhook was ever delivered, and the customer was left
 * on the Free plan looking at a "Plan updated." banner.
 *
 * This closes that gap without trusting the browser: the subscription is read
 * back from Razorpay server-to-server, and the org it belongs to comes from
 * the notes Razorpay stored at creation — never from the caller. Only a
 * subscription Razorpay itself reports as paid activates a plan.
 *
 * applyPlan is idempotent, so the webhook arriving later is harmless.
 */
export async function confirmRazorpaySubscriptionAction(subscriptionId: string) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage");
  if (flags.billingProvider !== "razorpay") return { ok: false, error: "Razorpay is not the billing provider" };
  if (!/^sub_[A-Za-z0-9]+$/.test(subscriptionId)) return { ok: false, error: "Unknown subscription" };

  let sub;
  try {
    sub = await getRazorpaySubscription(subscriptionId);
  } catch (err) {
    logger.error({ err, subscriptionId }, "confirm subscription: Razorpay lookup failed");
    return { ok: false, error: "Couldn't reach Razorpay to confirm the payment" };
  }

  if (sub.notes?.orgId !== ctx.active.org.id) {
    logger.warn({ subscriptionId, orgId: ctx.active.org.id }, "confirm subscription: org mismatch");
    return { ok: false, error: "Unknown subscription" };
  }

  // Razorpay's own view of whether it has been paid for.
  if (!["active", "authenticated", "completed"].includes(sub.status)) {
    return { ok: false, error: `Payment is still ${sub.status} — it can take a moment to confirm` };
  }

  const planKey = sub.notes?.planKey as PlanKey | undefined;
  if (!planKey || !PLAN_KEYS.includes(planKey)) return { ok: false, error: "Unknown plan" };
  const interval = sub.notes?.interval === "year" ? "year" : "month";

  await applyPlan(
    ctx.active.org.id,
    planKey,
    interval,
    ctx.user.id,
    {
      customerId: sub.customer_id,
      subscriptionId: sub.id,
      periodEnd: sub.current_end ? new Date(sub.current_end * 1000) : undefined,
    },
    "razorpay",
  );
  // Receipts come from Razorpay's own invoices. Never fatal: the customer has
  // their plan either way, and the webhook will mirror them later too.
  await mirrorRazorpayInvoices(ctx.active.org.id, sub.id);
  revalidatePath("/settings/billing");
  return { ok: true };
}
