import { isSubscriptionEntitled } from "@/lib/entitlements-pure";

/**
 * Monthly recurring revenue for one subscription, in minor units of the
 * currency it is actually billed in. Pure so the admin overview and the
 * acquisition report agree on one definition:
 *
 *  - only `active` subscriptions count (trials and past-due are not revenue yet)
 *  - annual plans are spread over 12 months
 *  - the subscription's own discount is applied
 *  - Razorpay (INR) subscriptions use the plan's native INR prices, everything
 *    else USD, and the two currencies are never added together
 */
export type MrrSub = {
  status: string;
  interval: string;
  provider?: string | null;
  discountPct?: number | null;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  canceledAt?: Date | null;
  plan: { priceMonthly: number; priceAnnual: number; priceMonthlyInr?: number; priceAnnualInr?: number };
};

export type Mrr = { usd: number; inr: number };
export const ZERO_MRR: Mrr = { usd: 0, inr: 0 };

export function subscriptionMrr(s: MrrSub | null | undefined): Mrr {
  if (!s || s.status !== "active" || !isSubscriptionEntitled(s)) return ZERO_MRR;
  const inr = s.provider === "razorpay";
  const monthly = inr ? (s.plan.priceMonthlyInr ?? 0) : s.plan.priceMonthly;
  const annual = inr ? (s.plan.priceAnnualInr ?? 0) : s.plan.priceAnnual;
  const base = s.interval === "year" ? annual / 12 : monthly;
  const discount = Math.min(100, Math.max(0, s.discountPct ?? 0));
  const value = Math.round(base * (1 - discount / 100));
  return inr ? { usd: 0, inr: value } : { usd: value, inr: 0 };
}

export const addMrr = (a: Mrr, b: Mrr): Mrr => ({ usd: a.usd + b.usd, inr: a.inr + b.inr });
