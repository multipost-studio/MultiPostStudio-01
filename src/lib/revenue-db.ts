import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { addMrr, subscriptionMrr, ZERO_MRR } from "@/lib/mrr";
import { EMPTY_FX, sanitizeRates, type FxRates, type InvoiceRow } from "@/lib/revenue";

/** SystemSetting key holding the admin-maintained exchange rates (JSON). */
export const FX_KEY = "fx_rates";

/** Stored rates, or just `{USD: 1}` when none were saved yet or the read fails. */
export async function getFxRates(): Promise<FxRates> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: FX_KEY } });
    if (!row) return EMPTY_FX;
    const parsed = JSON.parse(row.value) as { rates?: Record<string, unknown>; updatedAt?: string | null; source?: string | null };
    return {
      rates: sanitizeRates(parsed.rates ?? {}),
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
      source: typeof parsed.source === "string" ? parsed.source : null,
    };
  } catch (err) {
    logger.warn({ err }, "fx rates unreadable, using USD only");
    return EMPTY_FX;
  }
}

export type RevenueSource = {
  invoices: InvoiceRow[];
  /** Active-subscription MRR keyed by billing currency, in minor units. */
  mrr: Record<string, number>;
};

/**
 * Everything the revenue page aggregates. Paid and open invoices only (void is
 * not revenue), bounded for safety, selecting just the columns the maths needs.
 */
export async function loadRevenueSource(): Promise<RevenueSource> {
  const [invoices, subs] = await Promise.all([
    db.invoice.findMany({
      where: { status: { in: ["paid", "open"] } },
      select: { amountDue: true, currency: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 50_000,
    }),
    db.subscription.findMany({
      where: { status: "active" },
      take: 20_000,
      select: {
        status: true,
        interval: true,
        provider: true,
        discountPct: true,
        currentPeriodEnd: true,
        trialEndsAt: true,
        canceledAt: true,
        plan: { select: { priceMonthly: true, priceAnnual: true, priceMonthlyInr: true, priceAnnualInr: true } },
      },
    }),
  ]);
  const total = subs.reduce((acc, s) => addMrr(acc, subscriptionMrr(s)), ZERO_MRR);
  return {
    invoices,
    // Subscription billing currency follows its provider (Razorpay = INR, otherwise USD) — see lib/mrr.ts.
    mrr: { ...(total.usd ? { USD: total.usd } : {}), ...(total.inr ? { INR: total.inr } : {}) },
  };
}
