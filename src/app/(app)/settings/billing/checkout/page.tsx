import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/session";
import { assertPermission } from "@/lib/rbac";
import { env, flags } from "@/lib/env";
import { getRazorpaySubscription } from "@/lib/adapters/razorpay";
import { getPlan } from "@/lib/plans";
import { logger } from "@/lib/logger";
import { RazorpayCheckout } from "./checkout-client";

export const metadata: Metadata = { title: "Complete your subscription" };

/**
 * Razorpay checkout, hosted by us.
 *
 * We used to redirect to the subscription's `short_url` (rzp.io). That page
 * has no way back to the app — POST /v1/subscriptions accepts no
 * `callback_url` or `callback_method`, so a customer who decided not to pay
 * was stranded there with no cancel and no back button.
 *
 * Razorpay's Checkout modal takes the same `subscription_id` and opens over
 * this page, so dismissing it lands them back on their billing settings with
 * nothing charged and nothing changed.
 *
 * The plan itself is applied by the webhook (subscription.activated /
 * subscription.charged), never by this page — the browser is not a trustworthy
 * source for "the customer paid".
 */
export default async function RazorpayCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ sub?: string }>;
}) {
  const { sub } = await searchParams;
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.orgRole, "billing.manage");

  if (!sub || !/^sub_[A-Za-z0-9]+$/.test(sub) || flags.billingProvider !== "razorpay") {
    redirect("/settings/billing");
  }

  let subscription;
  try {
    subscription = await getRazorpaySubscription(sub);
  } catch (err) {
    logger.error({ err, sub }, "razorpay checkout: subscription lookup failed");
    redirect("/settings/billing?error=checkout");
  }

  // The subscription id is in the URL, so authorization can't come from the
  // URL. Razorpay stores the org on the subscription's notes at creation —
  // that is what decides whether this checkout belongs to the caller.
  if (subscription.notes?.orgId !== ctx.active.org.id) {
    logger.warn(
      { sub, orgId: ctx.active.org.id },
      "razorpay checkout: subscription does not belong to this org",
    );
    redirect("/settings/billing");
  }

  // Already paid for — nothing to collect.
  if (["active", "authenticated", "completed"].includes(subscription.status)) {
    redirect("/settings/billing?changed=1");
  }

  const planKey = subscription.notes?.planKey ?? "pro";
  const interval = subscription.notes?.interval === "year" ? "year" : "month";
  const plan = await getPlan(planKey as Parameters<typeof getPlan>[0]);

  return (
    <RazorpayCheckout
      subscriptionId={sub}
      // Publishable key — safe in the browser; the secret never leaves the server.
      keyId={env.RAZORPAY_KEY_ID!}
      planName={plan.name}
      interval={interval}
      email={ctx.user.email}
      customerName={ctx.user.name ?? ctx.active.org.name}
    />
  );
}
