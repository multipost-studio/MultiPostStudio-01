import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { stripe } from "@/lib/adapters/billing";
import { listRazorpayInvoices, refundRazorpayPayment } from "@/lib/adapters/razorpay";

/**
 * Refunds and payment retries through the payment gateway the invoice was billed on.
 *
 * Nothing here decides whether a refund should happen: that is the approval workflow in actions/admin-refunds. This module
 * only finds the gateway payment behind a local invoice and asks the gateway to refund it. Every refund carries an
 * idempotency key (the refund request's id), so repeating a call after a timeout can never refund twice.
 *
 * Invoices raised before gateway ids were stored are resolved from the gateway on first use and the ids are saved.
 * This code is checked against the Stripe SDK's types and unit tests with the gateways mocked; it has not been run
 * against a live gateway account. Try it in the gateway's test mode before relying on it.
 */
export type PaymentRef = { provider: "stripe"; invoiceId: string; paymentIntent?: string; charge?: string } | { provider: "razorpay"; paymentId: string };
export type Resolved = { ok: true; ref: PaymentRef } | { ok: false; error: string };

type InvoiceRow = {
  id: string;
  orgId: string;
  number: string;
  amountDue: number;
  periodStart: Date;
  periodEnd: Date;
  provider: string | null;
  providerInvoiceId: string | null;
  providerPaymentId: string | null;
};

const clip = (e: unknown) => String(e instanceof Error ? e.message : e).replace(/\s+/g, " ").slice(0, 300);

async function save(invoiceId: string, data: { provider?: string; providerInvoiceId?: string; providerPaymentId?: string }): Promise<void> {
  await db.invoice.update({ where: { id: invoiceId }, data }).catch((err) => logger.warn({ err, invoiceId }, "could not save gateway ids on the invoice"));
}

/** Find the gateway payment for a local invoice. Never throws. */
export async function resolvePaymentRef(inv: InvoiceRow): Promise<Resolved> {
  try {
    const sub = await db.subscription.findUnique({ where: { orgId: inv.orgId }, select: { provider: true, stripeSubscriptionId: true } });
    const provider = inv.provider ?? sub?.provider ?? null;

    if (provider === "stripe") {
      const s = await stripe();
      if (!s) return { ok: false, error: "Stripe isn't configured on this deployment" };
      let stripeInvoiceId = inv.providerInvoiceId ?? (inv.number.startsWith("in_") ? inv.number : null);
      if (!stripeInvoiceId) {
        // The webhook stores Stripe's own invoice number; look it up.
        const found = await s.invoices.search({ query: `number:"${inv.number.replace(/"/g, "")}"`, limit: 1 });
        stripeInvoiceId = found.data[0]?.id ?? null;
      }
      if (!stripeInvoiceId) return { ok: false, error: "Couldn't find this invoice at Stripe" };
      const payments = await s.invoicePayments.list({ invoice: stripeInvoiceId, status: "paid", limit: 5 });
      const pay = payments.data[0]?.payment;
      const paymentIntent = typeof pay?.payment_intent === "string" ? pay.payment_intent : pay?.payment_intent?.id;
      const charge = typeof pay?.charge === "string" ? pay.charge : pay?.charge?.id;
      if (!paymentIntent && !charge) return { ok: false, error: "Stripe has no paid payment for this invoice, so there is nothing to refund" };
      await save(inv.id, { provider: "stripe", providerInvoiceId: stripeInvoiceId });
      return { ok: true, ref: { provider: "stripe", invoiceId: stripeInvoiceId, paymentIntent, charge } };
    }

    if (provider === "razorpay") {
      let paymentId = inv.providerPaymentId;
      if (!paymentId && sub?.stripeSubscriptionId) {
        const list = await listRazorpayInvoices(sub.stripeSubscriptionId);
        const match = list.find((x) => x.status === "paid" && x.payment_id && (x.amount_paid ?? x.amount) === inv.amountDue && (!x.billing_start || x.billing_start * 1000 === inv.periodStart.getTime()));
        paymentId = match?.payment_id ?? null;
        if (match) await save(inv.id, { provider: "razorpay", providerInvoiceId: match.id, providerPaymentId: match.payment_id });
      }
      if (!paymentId) return { ok: false, error: "Couldn't find the Razorpay payment for this invoice" };
      return { ok: true, ref: { provider: "razorpay", paymentId } };
    }

    return { ok: false, error: "This invoice wasn't billed through a payment gateway, so it can't be refunded here" };
  } catch (err) {
    logger.error({ err, invoiceId: inv.id }, "payment lookup failed");
    return { ok: false, error: `The payment gateway couldn't be reached: ${clip(err)}` };
  }
}

export type RefundOutcome = { ok: true; providerRefundId: string } | { ok: false; error: string };

export async function issueRefund(args: { ref: PaymentRef; amountMinor: number; currency: string; idempotencyKey: string; requestId: string; invoiceId: string }): Promise<RefundOutcome> {
  const { ref, amountMinor, idempotencyKey } = args;
  try {
    if (ref.provider === "stripe") {
      const s = await stripe();
      if (!s) return { ok: false, error: "Stripe isn't configured on this deployment" };
      const refund = await s.refunds.create(
        { ...(ref.paymentIntent ? { payment_intent: ref.paymentIntent } : { charge: ref.charge }), amount: amountMinor, metadata: { refundRequestId: args.requestId, invoiceId: args.invoiceId } },
        { idempotencyKey },
      );
      return { ok: true, providerRefundId: refund.id };
    }
    const refund = await refundRazorpayPayment(ref.paymentId, amountMinor, idempotencyKey, { refundRequestId: args.requestId, invoiceId: args.invoiceId });
    if (!refund.id) return { ok: false, error: "Razorpay didn't return a refund id" };
    return { ok: true, providerRefundId: refund.id };
  } catch (err) {
    logger.error({ err, requestId: args.requestId }, "gateway refund failed");
    return { ok: false, error: clip(err) };
  }
}

/** Ask Stripe to collect an open invoice again. Razorpay retries its own subscription charges and has no manual retry. */
export async function retryInvoicePayment(inv: InvoiceRow): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  try {
    const sub = await db.subscription.findUnique({ where: { orgId: inv.orgId }, select: { provider: true } });
    const provider = inv.provider ?? sub?.provider ?? null;
    if (provider === "razorpay") return { ok: false, error: "Razorpay retries failed subscription charges on its own schedule and offers no manual retry. Ask the customer to update their payment method." };
    if (provider !== "stripe") return { ok: false, error: "This invoice wasn't billed through a payment gateway" };
    const s = await stripe();
    if (!s) return { ok: false, error: "Stripe isn't configured on this deployment" };
    let id = inv.providerInvoiceId ?? (inv.number.startsWith("in_") ? inv.number : null);
    if (!id) id = (await s.invoices.search({ query: `number:"${inv.number.replace(/"/g, "")}"`, limit: 1 })).data[0]?.id ?? null;
    if (!id) return { ok: false, error: "Couldn't find this invoice at Stripe" };
    const paid = await s.invoices.pay(id);
    await save(inv.id, { provider: "stripe", providerInvoiceId: id });
    return paid.status === "paid" ? { ok: true, message: "Stripe collected the payment" } : { ok: false, error: `Stripe tried the payment and the invoice is still ${paid.status ?? "unpaid"}` };
  } catch (err) {
    logger.warn({ err, invoiceId: inv.id }, "payment retry failed");
    return { ok: false, error: `Stripe couldn't collect the payment: ${clip(err)}` };
  }
}
