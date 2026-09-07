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
      // Recurring billing. applyPlan only mirrors an invoice row in stub mode
      // ("the provider webhook is the source of truth" in real mode) — but no
      // invoice event was handled, so with Stripe live the billing history
      // stayed permanently empty and a failed payment was never reflected.
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const inv = event.data.object as import("stripe").default.Invoice;
        const paid = event.type === "invoice.payment_succeeded";

        // Resolve the org from OUR record of the subscription/customer, never
        // from webhook-supplied metadata alone.
        const subId =
          typeof (inv as { subscription?: unknown }).subscription === "string"
            ? ((inv as { subscription?: string }).subscription as string)
            : undefined;
        const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
        const local = await db.subscription.findFirst({
          where: subId
            ? { stripeSubscriptionId: subId }
            : customerId
              ? { stripeCustomerId: customerId }
              : { id: "__none__" },
        });
        if (!local) {
          logger.warn({ subId, customerId, type: event.type }, "stripe invoice for unknown subscription");
          break;
        }

        const line = inv.lines?.data?.[0];
        const start = line?.period?.start ? new Date(line.period.start * 1000) : new Date();
        const end = line?.period?.end ? new Date(line.period.end * 1000) : start;

        // Keyed on the Stripe invoice number/id, which is unique in our table —
        // so a re-delivered or manually resent event updates the same row
        // instead of creating a second invoice.
        const number = inv.number ?? inv.id ?? `stripe-${event.id}`;
        await db.invoice.upsert({
          where: { number },
          create: {
            orgId: local.orgId,
            number,
            amountDue: paid ? (inv.amount_paid ?? inv.amount_due ?? 0) : (inv.amount_due ?? 0),
            currency: (inv.currency ?? "usd").toLowerCase(),
            status: paid ? "paid" : "open",
            periodStart: start,
            periodEnd: end,
            pdfUrl: inv.invoice_pdf ?? null,
          },
          update: {
            status: paid ? "paid" : "open",
            amountDue: paid ? (inv.amount_paid ?? inv.amount_due ?? 0) : (inv.amount_due ?? 0),
            pdfUrl: inv.invoice_pdf ?? null,
          },
        });

        // A failed renewal must show as past_due; a successful one clears it.
        await db.subscription.update({
          where: { id: local.id },
          data: {
            status: paid ? "active" : "past_due",
            ...(paid && end > start ? { currentPeriodEnd: end } : {}),
          },
        });
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
