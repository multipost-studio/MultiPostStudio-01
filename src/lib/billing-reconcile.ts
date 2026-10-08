import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/events";
import { flags } from "@/lib/env";
import { invalidateOrgPlan } from "@/lib/entitlements";
import { localFromStripe } from "@/lib/billing-rules";
import { stripe } from "@/lib/adapters/billing";
import { getRazorpaySubscription } from "@/lib/adapters/razorpay";

/**
 * Reconciliation: webhooks are the fast path, but they can be missed (an endpoint that was never
 * configured, an outage, a deploy mid-delivery). Entitlement trusts a stored "active" until something
 * says otherwise, so a subscription whose renewal event never arrived would stay paid-for forever, or
 * a customer who did pay would silently lapse. This reads the provider's own state for subscriptions
 * that should have renewed by now and corrects ours. It only ever moves our row toward what the
 * provider reports, never invents state, and never extends a paid period beyond the provider's.
 */

export type LocalSub = { status: string; currentPeriodEnd: Date; canceledAt: Date | null };
export type Correction = { status: string; currentPeriodEnd: Date; canceledAt: Date | null; reason: string };

const later = (a: Date, b: Date | null) => (b && b > a ? b : a);

export function decideFromStripe(local: LocalSub, live: { status: string; cancel_at_period_end?: boolean | null; periodEnd?: Date | null }, now = new Date()): Correction | null {
  const mapped = localFromStripe({ status: live.status, cancelAtPeriodEnd: live.cancel_at_period_end });
  const end = later(local.currentPeriodEnd, live.periodEnd ?? null);
  const canceledAt = mapped.canceled ? (local.canceledAt ?? now) : mapped.status === "active" ? null : local.canceledAt;
  const same = mapped.status === local.status && end.getTime() === local.currentPeriodEnd.getTime();
  return same ? null : { status: mapped.status, currentPeriodEnd: end, canceledAt, reason: `stripe reports ${live.status}${live.cancel_at_period_end ? " (cancelling at period end)" : ""}` };
}

export function decideFromRazorpay(local: LocalSub, live: { status: string; current_end?: number | null }, now = new Date()): Correction | null {
  const providerEnd = live.current_end ? new Date(live.current_end * 1000) : null;
  const end = later(local.currentPeriodEnd, providerEnd);
  let status = local.status;
  let canceledAt = local.canceledAt;
  switch (live.status) {
    case "active":
      // A customer who cancelled stays cancelled (paid time runs out); anyone else is simply current.
      if (local.status !== "canceled") status = "active";
      break;
    case "cancelled":
    case "completed":
    case "expired":
      status = "canceled";
      canceledAt = local.canceledAt ?? now;
      break;
    case "halted":
    case "pending":
      if (local.status !== "canceled") status = "past_due";
      break;
    default:
      return null; // created / authenticated / paused: nothing to correct from
  }
  const same = status === local.status && end.getTime() === local.currentPeriodEnd.getTime();
  return same ? null : { status, currentPeriodEnd: end, canceledAt, reason: `razorpay reports ${live.status}` };
}

const BATCH = 25;
/** How long past its period end a subscription must be before we go and ask the provider. */
const OVERDUE_MS = 12 * 3_600_000;
const THROTTLE_MS = 6 * 3_600_000;
const STAMP_KEY = "billing_reconcile_last_run";

export type ReconcileResult = { checked: number; corrected: number; failed: number; skipped?: "not-configured" | "throttled" };

export async function reconcileSubscriptions(opts: { force?: boolean } = {}): Promise<ReconcileResult> {
  if (!flags.realBilling) return { checked: 0, corrected: 0, failed: 0, skipped: "not-configured" };

  if (!opts.force) {
    const stamp = await db.systemSetting.findUnique({ where: { key: STAMP_KEY }, select: { value: true } }).catch(() => null);
    const last = stamp ? Date.parse(JSON.parse(stamp.value) as string) : 0;
    if (Number.isFinite(last) && Date.now() - last < THROTTLE_MS) return { checked: 0, corrected: 0, failed: 0, skipped: "throttled" };
  }
  await db.systemSetting
    .upsert({ where: { key: STAMP_KEY }, create: { key: STAMP_KEY, value: JSON.stringify(new Date().toISOString()) }, update: { value: JSON.stringify(new Date().toISOString()) } })
    .catch(() => undefined);

  const overdue = await db.subscription.findMany({
    where: {
      provider: { in: ["stripe", "razorpay"] },
      stripeSubscriptionId: { startsWith: "sub_" },
      status: { in: ["active", "past_due", "trialing"] },
      currentPeriodEnd: { lt: new Date(Date.now() - OVERDUE_MS) },
    },
    orderBy: { currentPeriodEnd: "asc" },
    take: BATCH,
  });

  let corrected = 0;
  let failed = 0;
  for (const sub of overdue) {
    const id = sub.stripeSubscriptionId!;
    if (id.startsWith("sub_stub_")) continue;
    try {
      let fix: Correction | null = null;
      if (sub.provider === "stripe") {
        const s = await stripe();
        if (!s) continue;
        const live = await s.subscriptions.retrieve(id);
        const raw = live as unknown as { current_period_end?: number };
        const endUnix = live.items?.data?.[0]?.current_period_end ?? raw.current_period_end;
        fix = decideFromStripe(sub, { status: live.status, cancel_at_period_end: live.cancel_at_period_end, periodEnd: endUnix ? new Date(endUnix * 1000) : null });
      } else {
        const live = await getRazorpaySubscription(id);
        fix = decideFromRazorpay(sub, live);
      }
      if (!fix) continue;
      await db.subscription.update({ where: { id: sub.id }, data: { status: fix.status, currentPeriodEnd: fix.currentPeriodEnd, canceledAt: fix.canceledAt } });
      invalidateOrgPlan(sub.orgId);
      corrected++;
      await logAudit({
        orgId: sub.orgId,
        action: "billing.reconciled",
        targetType: "subscription",
        targetId: sub.id,
        metadata: { from: { status: sub.status, periodEnd: sub.currentPeriodEnd }, to: { status: fix.status, periodEnd: fix.currentPeriodEnd }, reason: fix.reason, provider: sub.provider },
      }).catch(() => undefined);
    } catch (err) {
      failed++;
      logger.warn({ err, orgId: sub.orgId, provider: sub.provider }, "billing reconcile: provider lookup failed for one subscription");
    }
  }
  return { checked: overdue.length, corrected, failed };
}
