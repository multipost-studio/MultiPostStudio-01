/* Pure subscription-entitlement rules (no DB) so client-safe modules can share them. */

/**
 * Configurable past-due grace period in days.
 * When payment fails, customers maintain access for a configurable grace window
 * (default 7 days) to resolve payment methods before downgrading to Free.
 */
export const PAST_DUE_GRACE_DAYS = Number(process.env.BILLING_PAST_DUE_GRACE_DAYS || 7);

export function isSubscriptionEntitled(sub: {
  status: string;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  canceledAt?: Date | null;
}): boolean {
  const now = Date.now();

  // 1. ACTIVE: entitled
  if (sub.status === "active") return true;

  // 2. TRIALING: entitled only while the trial has not expired
  if (sub.status === "trialing") {
    if (sub.trialEndsAt) {
      return sub.trialEndsAt.getTime() > now;
    }
    if (sub.currentPeriodEnd) {
      return sub.currentPeriodEnd.getTime() > now;
    }
    return true;
  }

  // 3. PAST_DUE: temporary payment failure — entitled during the grace period (7 days default)
  // after currentPeriodEnd. Once grace expires, access drops to free.
  if (sub.status === "past_due") {
    if (sub.currentPeriodEnd) {
      const graceEnd = sub.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000;
      return now <= graceEnd;
    }
    return false;
  }

  // 4. CANCELED: user canceled renewal but prepaid for the current period — entitled until currentPeriodEnd
  if (sub.status === "canceled") {
    if (sub.currentPeriodEnd) {
      return sub.currentPeriodEnd.getTime() > now;
    }
    return false;
  }

  // 5. UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED, etc. -> Not entitled (drops to free)
  return false;
}
