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
