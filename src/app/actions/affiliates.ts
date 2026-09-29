"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { ensureAffiliateApplication, affiliateLink, affiliateStats } from "@/lib/affiliates";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

export type ActionResult<T = undefined> = { ok: boolean; error?: string; message?: string; data?: T };
const ok = <T>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

/* ---------------- user-facing ---------------- */

export async function applyForAffiliateAction(acceptedTerms: boolean) {
  const user = await requireUser();
  if (!acceptedTerms) return fail("You must accept the Affiliate Program Terms to apply.");
  try {
    await enforceRateLimit(`affiliate-apply:${user.id}`, 5, 3_600_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  const affiliate = await ensureAffiliateApplication(user.id, acceptedTerms);
  revalidatePath("/settings/affiliate");
  return ok(
    { affiliateCode: affiliate.affiliateCode, applicationStatus: affiliate.applicationStatus },
    affiliate.applicationStatus === "approved" ? "You're approved — your link is ready." : "Application submitted for review.",
  );
}

export async function getMyAffiliateAction() {
  const user = await requireUser();
  const affiliate = await db.affiliate.findUnique({ where: { userId: user.id } });
  if (!affiliate) return ok(null);
  const stats = await affiliateStats(affiliate.id);
  return ok({
    applicationStatus: affiliate.applicationStatus,
    status: affiliate.status,
    affiliateCode: affiliate.affiliateCode,
    link: affiliateLink(affiliate.affiliateCode),
    commissionType: affiliate.commissionType,
    commissionRate: affiliate.commissionRate,
    commissionFixedAmount: affiliate.commissionFixedAmount,
    payoutThresholdMinor: affiliate.payoutThresholdMinor,
    currency: affiliate.currency,
    ...stats,
  });
}

/* ---------------- admin ---------------- */

async function requireAdmin() {
  const admin = await requirePlatformAdmin();
  return admin;
}

export async function adminApproveAffiliateAction(affiliateId: string) {
  const admin = await requireAdmin();
  const a = await db.affiliate.update({
    where: { id: affiliateId },
    data: { applicationStatus: "approved", status: "active", approvedAt: new Date(), rejectedAt: null },
  });
  await logAudit({ actorId: admin.id, action: "AFFILIATE_APPROVED", targetType: "affiliate", targetId: a.id });
  revalidatePath("/admin/affiliates");
  return ok(undefined, "Affiliate approved");
}

export async function adminRejectAffiliateAction(affiliateId: string) {
  const admin = await requireAdmin();
  const a = await db.affiliate.update({
    where: { id: affiliateId },
    data: { applicationStatus: "rejected", status: "suspended", rejectedAt: new Date() },
  });
  await logAudit({ actorId: admin.id, action: "AFFILIATE_REJECTED", targetType: "affiliate", targetId: a.id });
  revalidatePath("/admin/affiliates");
  return ok(undefined, "Application rejected");
}

export async function adminSetAffiliateStatusAction(affiliateId: string, status: "active" | "paused" | "suspended" | "terminated") {
  const admin = await requireAdmin();
  const data: Record<string, unknown> = { status };
  if (status === "suspended") data.suspendedAt = new Date();
  if (status === "terminated") data.terminatedAt = new Date();
  const a = await db.affiliate.update({ where: { id: affiliateId }, data });
  await logAudit({
    actorId: admin.id,
    action: status === "suspended" ? "AFFILIATE_SUSPENDED" : status === "terminated" ? "AFFILIATE_TERMINATED" : "AFFILIATE_REACTIVATED",
    targetType: "affiliate",
    targetId: a.id,
    metadata: { status },
  });
  revalidatePath("/admin/affiliates");
  return ok(undefined, `Affiliate set to ${status}`);
}

/** Approve pending commissions past a cooling-off point — v1: manual, one at a time; bulk/automatic aging rules are a follow-up. */
export async function adminApproveCommissionAction(commissionId: string) {
  const admin = await requireAdmin();
  const c = await db.affiliateCommission.findUnique({ where: { id: commissionId } });
  if (!c || c.status !== "pending") return fail("Commission is not in a pending state");
  await db.affiliateCommission.update({ where: { id: commissionId }, data: { status: "approved", approvedAt: new Date() } });
  await logAudit({ actorId: admin.id, orgId: c.orgId, action: "COMMISSION_APPROVED", targetType: "affiliateCommission", targetId: c.id });
  revalidatePath("/admin/affiliates");
  return ok(undefined, "Commission approved");
}

/** Group an affiliate's approved commissions into a payout request. No money moves — this is a ledger entry only. */
export async function adminCreatePayoutAction(affiliateId: string) {
  const admin = await requireAdmin();
  const commissions = await db.affiliateCommission.findMany({
    where: { affiliateId, status: "approved", payoutId: null },
  });
  if (commissions.length === 0) return fail("No approved commissions available to pay out");
  const amountMinor = commissions.reduce((sum, c) => sum + c.amountMinor, 0);
  const affiliate = await db.affiliate.findUnique({ where: { id: affiliateId } });
  if (!affiliate) return fail("Affiliate not found");
  if (amountMinor < affiliate.payoutThresholdMinor) {
    return fail(`Below payout threshold (${affiliate.payoutThresholdMinor} minor units)`);
  }

  const payout = await db.$transaction(async (tx) => {
    const p = await tx.affiliatePayout.create({
      data: { affiliateId, amountMinor, currency: affiliate.currency, status: "requested", method: affiliate.payoutMethod },
    });
    await tx.affiliateCommission.updateMany({
      where: { id: { in: commissions.map((c) => c.id) } },
      data: { payoutId: p.id },
    });
    return p;
  });
  await logAudit({ actorId: admin.id, action: "PAYOUT_REQUESTED", targetType: "affiliatePayout", targetId: payout.id, metadata: { amountMinor } });
  revalidatePath("/admin/affiliates");
  return ok(undefined, "Payout batch created");
}

/**
 * Admin confirms money was already sent through whatever real payout rail
 * they use outside this app. This is the ONLY way a payout reaches "paid" —
 * there is no automatic processor integration here (see lib/affiliates.ts).
 */
export async function adminMarkPayoutPaidAction(payoutId: string) {
  const admin = await requireAdmin();
  const payout = await db.affiliatePayout.update({
    where: { id: payoutId },
    data: { status: "paid", processedAt: new Date() },
  });
  await db.affiliateCommission.updateMany({ where: { payoutId }, data: { status: "paid" } });
  await logAudit({ actorId: admin.id, action: "PAYOUT_PAID", targetType: "affiliatePayout", targetId: payout.id });
  revalidatePath("/admin/affiliates");
  return ok(undefined, "Payout marked paid");
}

export async function adminAddAffiliateAdjustmentAction(affiliateId: string, amountMinor: number, reason: string) {
  const admin = await requireAdmin();
  if (!reason.trim()) return fail("A reason is required for every adjustment");
  const adj = await db.affiliateAdjustment.create({
    data: { affiliateId, amountMinor: Math.round(amountMinor), reason: reason.trim(), createdById: admin.id },
  });
  await logAudit({ actorId: admin.id, action: "COMMISSION_ADJUSTED", targetType: "affiliateAdjustment", targetId: adj.id, metadata: { amountMinor, reason } });
  revalidatePath("/admin/affiliates");
  return ok(undefined, "Adjustment recorded");
}
