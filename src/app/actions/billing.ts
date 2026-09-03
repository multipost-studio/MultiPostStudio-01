"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLAN_KEYS, type PlanKey } from "@/lib/constants";
import { requireWorkspace } from "@/lib/session";
import { assertPermission } from "@/lib/rbac";
import { startCheckout, applyPlan, cancelSubscription, reactivateSubscription } from "@/lib/adapters/billing";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { z } from "zod";

export async function startCheckoutAction(planKey: string, interval: "month" | "year") {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage"); // org-scoped, not workspace role
  if (!PLAN_KEYS.includes(planKey as PlanKey)) return;
  const url = await startCheckout(ctx.active.org.id, ctx.user.email, planKey as PlanKey, interval);
  redirect(url);
}

export async function confirmPlanChangeAction(planKey: string, interval: "month" | "year") {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage"); // org-scoped, not workspace role
  if (!PLAN_KEYS.includes(planKey as PlanKey)) return { ok: false, error: "Unknown plan" };
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
  if (coupon.amountOff <= 0) return { ok: false, error: "This code can't be redeemed here" };

  await db.$transaction([
    db.couponRedemption.create({
      data: { couponId: coupon.id, orgId: ctx.active.org.id, userId: ctx.user.id, amount: coupon.amountOff },
    }),
    db.coupon.update({ where: { id: coupon.id }, data: { redeemedCount: { increment: 1 } } }),
    db.organization.update({ where: { id: ctx.active.org.id }, data: { creditBalance: { increment: coupon.amountOff } } }),
  ]);
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
