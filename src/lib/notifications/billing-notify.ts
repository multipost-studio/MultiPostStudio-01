import { createForOrgAdmins } from "./service";

/**
 * Billing notifications for an organisation's owners and admins. They hang off the billing events the app
 * already processes (the provider webhooks and applyPlan), and every one carries a dedupe key built from
 * the event itself, so a webhook delivered twice, retried after a 500, or replayed by the reconciliation
 * job announces it once.
 */

const LINK = "/settings/billing";

const fmtDate = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** `ref` identifies the failing charge (invoice number, or provider subscription + period). */
export async function notifyPaymentFailed(orgId: string, ref: string) {
  return createForOrgAdmins(orgId, {
    type: "billing_payment_failed",
    title: "Your payment didn't go through",
    body: "We couldn't charge your payment method for your subscription. Update it to keep your plan active.",
    linkUrl: LINK,
    actionLabel: "Update payment",
    entityType: "organization",
    entityId: orgId,
    dedupeKey: `billing_payment_failed:${orgId}:${ref}`,
  });
}

/** Sent when the plan or billing cycle really changed (or a subscription started), not on every renewal. */
export async function notifyPlanChanged(orgId: string, args: { planName: string; interval: "month" | "year"; renewsOn: Date; isNew: boolean }) {
  return createForOrgAdmins(orgId, {
    type: "billing_plan_changed",
    title: args.isNew ? `Welcome to ${args.planName}` : `Plan updated to ${args.planName}`,
    body: `You're on ${args.planName}, billed ${args.interval === "year" ? "yearly" : "monthly"}. Your next renewal is ${fmtDate(args.renewsOn)}.`,
    linkUrl: LINK,
    actionLabel: "View billing",
    entityType: "organization",
    entityId: orgId,
    dedupeKey: `billing_plan_changed:${orgId}:${args.planName}:${args.interval}:${args.renewsOn.toISOString().slice(0, 10)}`,
  });
}

/** Cancellation that did not start with one of our own users (the provider ended it). */
export async function notifySubscriptionCanceled(orgId: string, args: { accessUntil: Date; endedNow: boolean }) {
  return createForOrgAdmins(orgId, {
    type: "billing_canceled",
    title: args.endedNow ? "Your subscription has ended" : "Your subscription was canceled",
    body: args.endedNow
      ? "Your paid plan has ended and the workspace is on the Free plan. You can subscribe again at any time."
      : `You keep your plan until ${fmtDate(args.accessUntil)}. After that the workspace moves to the Free plan.`,
    linkUrl: LINK,
    actionLabel: "View billing",
    entityType: "organization",
    entityId: orgId,
    dedupeKey: `billing_canceled:${orgId}:${args.endedNow ? "ended" : "pending"}:${args.accessUntil.toISOString().slice(0, 10)}`,
  });
}
