import { PAST_DUE_GRACE_DAYS, isSubscriptionEntitled } from "./entitlements-pure";

/**
 * Pure billing rules: who may switch to what, how a provider's subscription status maps to ours,
 * and what the billing page should tell the customer. No database and no provider calls, so every
 * rule is unit-tested and the webhooks, actions and UI all agree on one definition.
 */

export type PlanLike = {
  key: string;
  isPublic: boolean;
  isCustom: boolean;
  priceMonthly: number;
  priceAnnual: number;
  priceMonthlyInr?: number;
  priceAnnualInr?: number;
};

/**
 * A plan a customer may switch to by themselves: Free (a downgrade), or a public, non-custom plan
 * with a real price. A plan with no price that isn't Free (Enterprise, a custom or hidden plan) is
 * arranged with our team, and no self-serve path may grant it. Without this a zero-priced
 * "checkout" would hand Enterprise to anyone with billing permission.
 */
export function isSelfServePlan(plan: PlanLike | null | undefined): boolean {
  if (!plan) return false;
  if (plan.key === "free") return true;
  if (!plan.isPublic || plan.isCustom) return false;
  return plan.priceMonthly > 0 || plan.priceAnnual > 0 || (plan.priceMonthlyInr ?? 0) > 0 || (plan.priceAnnualInr ?? 0) > 0;
}

export function planAmount(plan: PlanLike, interval: "month" | "year", currency: "usd" | "inr"): number {
  if (currency === "inr") return (interval === "year" ? plan.priceAnnualInr : plan.priceMonthlyInr) ?? 0;
  return interval === "year" ? plan.priceAnnual : plan.priceMonthly;
}

/** A discount percentage clamped to 0-100. */
export function clampPct(pct: number | null | undefined): number {
  return Math.max(0, Math.min(100, Math.round(pct ?? 0)));
}

export function discounted(amount: number, pct: number | null | undefined): number {
  return Math.round(amount * (1 - clampPct(pct) / 100));
}

/* ───────────── provider status → local status ───────────── */

export type LocalStatusUpdate = { status: string; canceled: boolean };

/**
 * Stripe's subscription becomes "cancel at period end" while its status stays "active". The customer
 * asked to stop renewing, so locally that is "canceled": access continues until the paid period ends
 * (isSubscriptionEntitled), and the page says so. Mapping it to "active" instead hid the cancellation
 * the moment Stripe echoed it back.
 */
export function localFromStripe(sub: { status: string; cancelAtPeriodEnd?: boolean | null }): LocalStatusUpdate {
  if ((sub.status === "active" || sub.status === "trialing") && sub.cancelAtPeriodEnd) return { status: "canceled", canceled: true };
  if (sub.status === "canceled") return { status: "canceled", canceled: true };
  return { status: sub.status, canceled: false };
}

/**
 * Whether Razorpay itself says this subscription has been paid for. "authenticated" alone means the
 * customer approved the mandate, not that a charge succeeded, so it only counts once a charge has.
 */
export function razorpayGrantsAccess(sub: { status: string; paid_count?: number | null }): boolean {
  if (sub.status === "active" || sub.status === "completed") return true;
  return sub.status === "authenticated" && (sub.paid_count ?? 0) > 0;
}

/**
 * A provider subscription that a new one replaces. Changing plan creates a fresh provider subscription;
 * if the old one isn't retired it keeps billing the customer forever. Only real provider ids qualify
 * (the demo/stub ids are not), and never the subscription that is being applied right now.
 */
export function retirablePreviousSubscription(
  existing: { provider: string; stripeSubscriptionId: string | null } | null | undefined,
  nextSubscriptionId: string | undefined,
): { provider: "stripe" | "razorpay"; id: string } | null {
  if (!existing?.stripeSubscriptionId || !nextSubscriptionId) return null;
  if (existing.provider !== "stripe" && existing.provider !== "razorpay") return null;
  const real = (id: string) => id.startsWith("sub_") && !id.startsWith("sub_stub_");
  const old = existing.stripeSubscriptionId;
  if (!real(old) || !real(nextSubscriptionId) || old === nextSubscriptionId) return null;
  return { provider: existing.provider, id: old };
}

/* ───────────── what the billing page says ───────────── */

export type SubscriptionView = {
  state: "free" | "active" | "trialing" | "canceled_pending" | "past_due" | "expired";
  /** True while paid access is actually granted. */
  entitled: boolean;
  /** The plan whose rules apply right now. "free" once access has lapsed, whatever the row still says. */
  effectivePlanKey: string;
  /** Next charge, only while the subscription will actually renew. */
  renewsOn: Date | null;
  /** When paid access stops, for a cancelled or overdue subscription. */
  endsOn: Date | null;
};

type SubLike = {
  status: string;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  canceledAt?: Date | null;
};

/**
 * Derive what to show from the same rule that decides access (isSubscriptionEntitled), so the page
 * can never say "Pro, renews on 3 Nov" while the account has already dropped to Free.
 */
export function describeSubscription(sub: SubLike | null | undefined, planKey: string | null | undefined): SubscriptionView {
  // No subscription, or a free one: nothing to renew and nothing that can lapse.
  if (!sub || !planKey || planKey === "free") return { state: "free", entitled: true, effectivePlanKey: "free", renewsOn: null, endsOn: null };
  const entitled = isSubscriptionEntitled(sub);
  const end = sub.currentPeriodEnd ?? null;
  if (!entitled) return { state: "expired", entitled: false, effectivePlanKey: "free", renewsOn: null, endsOn: end };
  if (sub.status === "canceled") return { state: "canceled_pending", entitled: true, effectivePlanKey: planKey, renewsOn: null, endsOn: end };
  if (sub.status === "past_due") {
    const grace = end ? new Date(end.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000) : null;
    return { state: "past_due", entitled: true, effectivePlanKey: planKey, renewsOn: null, endsOn: grace };
  }
  if (sub.status === "trialing") return { state: "trialing", entitled: true, effectivePlanKey: planKey, renewsOn: end, endsOn: sub.trialEndsAt ?? end };
  return { state: "active", entitled: true, effectivePlanKey: planKey, renewsOn: end, endsOn: null };
}
