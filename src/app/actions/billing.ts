"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PLAN_KEYS, type PlanKey } from "@/lib/constants";
import { requireWorkspace } from "@/lib/session";
import { assertPermission } from "@/lib/rbac";
import { startCheckout, applyPlan, cancelSubscription } from "@/lib/adapters/billing";

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
