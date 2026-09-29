import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { getSettings } from "@/lib/settings";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";

/**
 * Affiliate program — real-money commissions on paid subscriptions.
 *
 * This module never moves money. `AffiliatePayout.status` only reaches "paid"
 * when an admin confirms (in the admin UI) that they already sent the money
 * through whatever real payout rail they use outside this app. There is no
 * Stripe Connect / PayPal Payouts / bank-transfer integration here — building
 * one is a deliberate later decision, not an oversight, because it requires
 * real provider credentials and sign-off this codebase doesn't have.
 *
 * Separate from the AI-credit Referral system (lib/referrals.ts), which
 * keeps working unchanged. An org can be attributed to at most one affiliate,
 * ever, set on first touch (AffiliateConversion.orgId is unique) — no
 * re-attribution window or last-click override in v1.
 */

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars, matches lib/referrals.ts

/** Bump when /legal/affiliate-terms changes materially — existing affiliates keep their recorded version. */
export const CURRENT_AFFILIATE_TERMS_VERSION = "2026-09-29";

function genCode(len = 7): string {
  const b = randomBytes(len);
  let s = "";
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s;
}

export function affiliateLink(code: string): string {
  return appUrl(`/signup?aff=${code}`);
}

/** SHA-256 of (ip + user-agent + calendar day) — a stable-for-a-day, non-reversible visitor fingerprint. Never store the raw IP. */
export function hashVisitor(ip: string, userAgent: string): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash("sha256").update(`${ip}|${userAgent}|${day}`).digest("hex");
}

/**
 * Start (or return the existing) affiliate application for a user.
 * Approval state depends on site settings: if applications aren't required,
 * or auto-approve is on, the row is created already approved+active.
 */
export async function ensureAffiliateApplication(userId: string, acceptedTerms: boolean) {
  const existing = await db.affiliate.findUnique({ where: { userId } });
  if (existing) return existing;
  if (!acceptedTerms) throw new Error("You must accept the Affiliate Program Terms to apply.");

  const s = await getSettings();
  const autoApprove = !s.affiliateApplicationRequired || s.affiliateAutoApprove;

  let code = "";
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = genCode();
    const taken = await db.affiliate.findUnique({ where: { affiliateCode: candidate }, select: { id: true } });
    if (!taken) {
      code = candidate;
      break;
    }
  }
  if (!code) throw new Error("could not allocate affiliate code");

  const affiliate = await db.affiliate.create({
    data: {
      userId,
      affiliateCode: code,
      applicationStatus: autoApprove ? "approved" : "pending_review",
      status: "active",
      commissionType: s.affiliateDefaultCommissionType,
      commissionRate: s.affiliateDefaultCommissionRate,
      commissionFixedAmount: s.affiliateDefaultFixedAmount,
      recurringMonths: s.affiliateDefaultRecurringMonths,
      cookieDurationDays: s.affiliateDefaultCookieDays,
      payoutThresholdMinor: s.affiliateDefaultPayoutThreshold,
      approvedAt: autoApprove ? new Date() : null,
      termsVersion: CURRENT_AFFILIATE_TERMS_VERSION,
      termsAcceptedAt: new Date(),
      disclosureAcknowledgedAt: new Date(),
    },
  });
  await logAudit({ actorId: userId, action: "AFFILIATE_CREATED", targetType: "affiliate", targetId: affiliate.id });
  return affiliate;
}

/**
 * Attribute an org to the affiliate behind `code`, once — called once the
 * user actually has an org (onboarding), same timing as
 * reconcileReferralRewards. No-ops if the program is off, the code is
 * unknown, it's a self-referral (affiliate's own org), or this org is already
 * attributed to someone.
 */
export async function attributeAffiliateConversion(code: string, orgId: string) {
  const s = await getSettings();
  if (!s.affiliateEnabled || !code || !orgId) return;

  const affiliate = await db.affiliate.findUnique({ where: { affiliateCode: code.trim().toUpperCase().slice(0, 16) } });
  if (!affiliate) return;

  const ownOrg = await db.membership.findFirst({ where: { userId: affiliate.userId, orgId }, select: { id: true } });
  if (ownOrg) return; // self-referral

  try {
    const conversion = await db.affiliateConversion.create({
      data: { affiliateId: affiliate.id, orgId, affiliateLinkId: null },
    });
    await logAudit({
      orgId,
      actorId: affiliate.userId,
      action: "AFFILIATE_CONVERSION_ATTRIBUTED",
      targetType: "affiliateConversion",
      targetId: conversion.id,
    });
    return conversion;
  } catch {
    // orgId already attributed (unique constraint) — first touch wins, not an error.
    return;
  }
}

/**
 * The commission engine. Call this after — and only after — an Invoice row
 * is written with status "paid" (both the direct checkout path in
 * lib/adapters/billing.ts and the Stripe/Razorpay renewal webhook handlers
 * call this). `invoiceId` unique on AffiliateCommission is the real
 * idempotency guard: a retried webhook calling this twice for the same
 * invoice is a no-op the second time, not a double commission.
 *
 * Deliberately does NOT trust anything but the invoice row already
 * persisted by the caller — no amount, orgId, or affiliate id is ever taken
 * from request/webhook payload data directly here.
 */
export async function generateCommissionForInvoice(invoiceId: string): Promise<void> {
  const s = await getSettings();
  if (!s.affiliateEnabled) return;

  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.status !== "paid") return;

  const conversion = await db.affiliateConversion.findUnique({ where: { orgId: invoice.orgId } });
  if (!conversion) return; // this org isn't attributed to any affiliate

  const affiliate = await db.affiliate.findUnique({ where: { id: conversion.affiliateId } });
  if (!affiliate || affiliate.applicationStatus !== "approved" || affiliate.status !== "active") return;

  const priorCount = await db.affiliateCommission.count({ where: { conversionId: conversion.id } });
  const isOnce = affiliate.commissionType === "percent_once" || affiliate.commissionType === "fixed_once";
  if (isOnce && priorCount >= 1) return;
  if (!isOnce && affiliate.recurringMonths > 0 && priorCount >= affiliate.recurringMonths) return;

  const isPercent = affiliate.commissionType === "percent_recurring" || affiliate.commissionType === "percent_once";
  const amountMinor = isPercent
    ? Math.round((invoice.amountDue * affiliate.commissionRate) / 100)
    : affiliate.commissionFixedAmount;
  if (amountMinor <= 0) return;

  try {
    const commission = await db.affiliateCommission.create({
      data: {
        affiliateId: affiliate.id,
        conversionId: conversion.id,
        invoiceId: invoice.id,
        orgId: invoice.orgId,
        amountMinor,
        currency: invoice.currency,
        status: "pending",
      },
    });
    if (!conversion.qualifiedAt) {
      await db.affiliateConversion.update({ where: { id: conversion.id }, data: { qualifiedAt: new Date() } });
    }
    await logAudit({
      orgId: invoice.orgId,
      actorId: affiliate.userId,
      action: "COMMISSION_CREATED",
      targetType: "affiliateCommission",
      targetId: commission.id,
      metadata: { amountMinor, currency: invoice.currency, invoiceId: invoice.id },
    });
  } catch (e) {
    // Unique constraint on invoiceId — another concurrent call (retried
    // webhook) already created this commission. Expected, not an error.
    logger.info({ invoiceId, err: e }, "commission already generated for this invoice — skipping duplicate");
  }
}

/**
 * Reverse a commission when its underlying invoice is refunded/voided.
 * Never deletes the row — financial history stays auditable.
 */
export async function reverseCommissionForInvoice(invoiceId: string, reason: string): Promise<void> {
  const commission = await db.affiliateCommission.findUnique({ where: { invoiceId } });
  if (!commission || commission.status === "reversed" || commission.status === "paid") return;
  // A commission already paid out is not reversed automatically — that
  // requires a deliberate admin adjustment (AffiliateAdjustment), since the
  // money may already have left the building via a manual payout.
  await db.affiliateCommission.update({
    where: { id: commission.id },
    data: { status: "reversed", reversedAt: new Date(), reversalReason: reason },
  });
  await logAudit({
    orgId: commission.orgId,
    action: "COMMISSION_REVERSED",
    targetType: "affiliateCommission",
    targetId: commission.id,
    metadata: { reason },
  });
}

export async function affiliateStats(affiliateId: string) {
  const [pending, approved, paid, reversed] = await Promise.all([
    db.affiliateCommission.aggregate({ where: { affiliateId, status: "pending" }, _sum: { amountMinor: true }, _count: true }),
    db.affiliateCommission.aggregate({ where: { affiliateId, status: "approved" }, _sum: { amountMinor: true }, _count: true }),
    db.affiliateCommission.aggregate({ where: { affiliateId, status: "paid" }, _sum: { amountMinor: true }, _count: true }),
    db.affiliateCommission.aggregate({ where: { affiliateId, status: "reversed" }, _sum: { amountMinor: true }, _count: true }),
  ]);
  const [clicks, conversions] = await Promise.all([
    db.affiliateClick.count({ where: { link: { affiliateId } } }),
    db.affiliateConversion.count({ where: { affiliateId } }),
  ]);
  return {
    pendingMinor: pending._sum.amountMinor ?? 0,
    approvedMinor: approved._sum.amountMinor ?? 0,
    paidMinor: paid._sum.amountMinor ?? 0,
    reversedMinor: reversed._sum.amountMinor ?? 0,
    commissionCount: pending._count + approved._count + paid._count,
    clicks,
    conversions,
  };
}
