import { NextResponse, type NextRequest } from "next/server";
import { env, flags } from "@/lib/env";
import { stripe, applyPlan, markSubscriptionCanceled } from "@/lib/adapters/billing";
import { localFromStripe } from "@/lib/billing-rules";
import { logAudit } from "@/lib/events";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { claimWebhookEvent, releaseWebhookEvent } from "@/lib/webhook-idempotency";
import type { PlanKey } from "@/lib/constants";
import { invalidateOrgPlan } from "@/lib/entitlements";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!flags.realBilling || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing not configured" }, { status: 501 });
  }
  // Soft flood guard before any crypto/DB work. Fail-open so a limiter
  // outage never blocks legitimate billing events.
  try {
    const { rateLimit } = await import("@/lib/rate-limit");
    const ip = req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",").pop()?.trim() ?? "unknown";
    const rl = await rateLimit(`webhook:stripe:${ip}`, 600, 60_000);
    if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  } catch {
    /* fail-open */
  }
  const s = (await stripe())!;
  const sig = req.headers.get("stripe-signature") ?? "";
  const raw = await req.text();
  // Webhook payloads are small JSON — 1MB cap blunts oversized-body floods.
  if (raw.length > 1024 * 1024) {
    return NextResponse.json({ error: "payload too large" }, { status: 413 });
  }

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
        const local = await db.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
        const targetOrgId = md.orgId || local?.orgId;

        const subRaw = sub as unknown as { current_period_end?: number };
        const periodEnd = sub.items?.data?.[0]?.current_period_end
          ? new Date(sub.items.data[0].current_period_end * 1000)
          : subRaw.current_period_end
            ? new Date(subRaw.current_period_end * 1000)
            : undefined;

        // "Cancel at period end" keeps Stripe's status at "active"; for us that is a cancellation
        // (paid access runs to the end of the period). Mapping it to active undid the customer's own
        // cancellation the moment Stripe echoed it back.
        const mapped = localFromStripe({ status: sub.status, cancelAtPeriodEnd: sub.cancel_at_period_end });
        if (targetOrgId && md.planKey && sub.status === "active" && !mapped.canceled) {
          await applyPlan(targetOrgId, md.planKey as PlanKey, (md.interval as "month" | "year") ?? "month", undefined, {
            customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
            subscriptionId: sub.id,
            periodEnd,
          }, "stripe");
        } else if (local) {
          // Synchronize states: past_due, unpaid, trialing, canceled, incomplete, incomplete_expired
          await db.subscription.update({
            where: { id: local.id },
            data: {
              status: mapped.status,
              // The period only ever moves forward: an older event must not shorten paid time.
              ...(periodEnd && periodEnd > local.currentPeriodEnd ? { currentPeriodEnd: periodEnd } : {}),
              ...(mapped.canceled ? { canceledAt: sub.canceled_at ? new Date(sub.canceled_at * 1000) : (local.canceledAt ?? new Date()) } : mapped.status === "active" ? { canceledAt: null } : {}),
              ...(sub.trial_end ? { trialEndsAt: new Date(sub.trial_end * 1000) } : {}),
            },
          });
          invalidateOrgPlan(local.orgId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as import("stripe").default.Subscription;
        const local = await db.subscription.findFirst({ where: { stripeSubscriptionId: sub.id } });
        if (local) {
          // Stripe only deletes a subscription when it has really ended (period over, or cancelled
          // at once), so paid access ends now. Our own provider call would only error here.
          await markSubscriptionCanceled(local.orgId, undefined, { endNow: true, source: "stripe" });
        }
        break;
      }
      case "charge.refunded":
      case "charge.dispute.created": {
        // Recorded for the team, not acted on automatically: whether a refund or a dispute ends access
        // is a business decision, and revoking a plan on an event nobody has reviewed would be worse.
        const obj = event.data.object as { id: string; customer?: string | { id: string } | null; amount_refunded?: number; amount?: number; currency?: string; charge?: string };
        let customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
        if (!customerId && obj.charge) {
          try {
            const ch = await s.charges.retrieve(obj.charge);
            customerId = typeof ch.customer === "string" ? ch.customer : ch.customer?.id;
          } catch (e) {
            logger.warn({ err: e }, "stripe dispute: charge lookup failed");
          }
        }
        const local = customerId ? await db.subscription.findFirst({ where: { stripeCustomerId: customerId } }) : null;
        logger.warn({ type: event.type, objectId: obj.id, orgId: local?.orgId }, "stripe refund/dispute received: needs a human look");
        await logAudit({
          orgId: local?.orgId,
          action: event.type === "charge.refunded" ? "billing.refund_received" : "billing.dispute_opened",
          targetType: "subscription",
          targetId: local?.id ?? obj.id,
          metadata: { eventId: event.id, objectId: obj.id, amount: obj.amount_refunded ?? obj.amount ?? null, currency: obj.currency ?? null },
        });
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
        const savedInvoice = await db.invoice.upsert({
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
        if (paid) {
          const { generateCommissionForInvoice } = await import("@/lib/affiliates");
          await generateCommissionForInvoice(savedInvoice.id).catch((e) =>
            logger.warn({ err: e, invoiceId: savedInvoice.id }, "affiliate commission generation failed"),
          );
        }

        // A failed renewal must show as past_due and a successful one clears it, but events arrive
        // late and out of order, and a cancelled customer's last invoice must not revive the plan.
        // So the status comes from Stripe's own current view of the subscription when we can read it.
        let nextStatus: string;
        let live: import("stripe").default.Subscription | null = null;
        if (subId) {
          try {
            live = await s.subscriptions.retrieve(subId);
          } catch (e) {
            logger.warn({ err: e, subId }, "stripe invoice: live subscription lookup failed");
          }
        }
        if (live) nextStatus = localFromStripe({ status: live.status, cancelAtPeriodEnd: live.cancel_at_period_end }).status;
        else if (local.status === "canceled") nextStatus = "canceled";
        else nextStatus = paid ? "active" : "past_due";

        await db.subscription.update({
          where: { id: local.id },
          data: {
            status: nextStatus,
            // Never move the paid period backwards on a stale event.
            ...(paid && end > start && end > local.currentPeriodEnd ? { currentPeriodEnd: end } : {}),
          },
        });
        invalidateOrgPlan(local.orgId);
        break;
      }
      default:
        break;
    }
  } catch (e) {
    // Release the claim so Stripe's retry can proceed: a held claim would
    // turn the retry into a "duplicate" and silently lose the event.
    // Handlers above are replay-safe (applyPlan upserts; invoices upsert by
    // provider number; status writes are last-writer-wins on fresh reads).
    await releaseWebhookEvent("stripe", event.id);
    logger.error({ err: e, type: event.type }, "stripe webhook handler error");
    return NextResponse.json({ error: "handler error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
