import { NextResponse, type NextRequest } from "next/server";
import { env, flags } from "@/lib/env";
import { stripe, applyPlan, cancelSubscription } from "@/lib/adapters/billing";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { claimWebhookEvent } from "@/lib/webhook-idempotency";
import type { PlanKey } from "@/lib/constants";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!flags.realBilling || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing not configured" }, { status: 501 });
  }
  const s = (await stripe())!;
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();

  let event: import("stripe").default.Event;
  try {
    event = s.webhooks.constructEvent(raw, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    logger.warn({ err: e }, "stripe webhook signature verification failed");
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  // Idempotency — Stripe retries and allows manual resend from the dashboard.
  if (!(await claimWebhookEvent("stripe", event.id, event.type))) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const sess = event.data.object as import("stripe").default.Checkout.Session;
        const md = sess.metadata ?? {};
        if (md.orgId && md.planKey) {
          const sub =
            typeof sess.subscription === "string"
              ? await s.subscriptions.retrieve(sess.subscription)
              : (sess.subscription as import("stripe").default.Subscription | null);
          await applyPlan(md.orgId, md.planKey as PlanKey, (md.interval as "month" | "year") ?? "month", undefined, {
            customerId: typeof sess.customer === "string" ? sess.customer : sess.customer?.id,
            subscriptionId: sub?.id,
            periodEnd: sub?.items?.data?.[0]?.current_period_end
              ? new Date(sub.items.data[0].current_period_end * 1000)
              : undefined,
          }, "stripe");
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as import("stripe").default.Subscription;
        const md = sub.metadata ?? {};
        if (md.orgId && md.planKey && sub.status === "active") {
          await applyPlan(md.orgId, md.planKey as PlanKey, (md.interval as "month" | "year") ?? "month", undefined, {
            customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            subscriptionId: sub.id,
            periodEnd: sub.items?.data?.[0]?.current_period_end
              ? new Date(sub.items.data[0].current_period_end * 1000)
              : undefined,
          }, "stripe");
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as import("stripe").default.Subscription;
        const local = await db.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
        if (local) await cancelSubscription(local.orgId);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    logger.error({ err: e, type: event.type }, "stripe webhook handler error");
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
