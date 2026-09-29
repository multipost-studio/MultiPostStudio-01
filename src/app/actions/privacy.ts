"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { filePrivacyRequest, type PrivacyRequestType } from "@/lib/privacy";

export type ActionResult<T = undefined> = { ok: boolean; error?: string; message?: string; data?: T };
const ok = <T>(data?: T, message?: string): ActionResult<T> => ({ ok: true, data, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

const TYPE_LABEL: Record<PrivacyRequestType, string> = {
  access: "Data access request",
  correction: "Correction request",
  erasure: "Erasure request",
  consent_withdrawal: "Consent withdrawal",
  complaint: "Privacy complaint",
};

/* ---------------- user-facing ---------------- */

export async function fileRightsRequestAction(type: PrivacyRequestType, details?: string) {
  const user = await requireUser();
  if (type === "complaint" && !details?.trim()) return fail("Please describe your complaint so we can act on it.");
  const request = await filePrivacyRequest({ userId: user.id, type, details });
  revalidatePath("/settings/privacy");
  return ok({ id: request.id }, `${TYPE_LABEL[type]} submitted — we'll respond within 90 days.`);
}

/** Self-service consent withdrawal for the Affiliate Program — the one real opt-in flow in the product (see docs/DPDP-CONSENT-INVENTORY.md). */
export async function withdrawAffiliateConsentAction() {
  const user = await requireUser();
  const affiliate = await db.affiliate.findUnique({ where: { userId: user.id } });
  if (!affiliate) return fail("You're not enrolled in the Affiliate Program.");
  if (affiliate.status === "suspended" || affiliate.status === "terminated") return fail("Already withdrawn.");
  await db.affiliate.update({ where: { id: affiliate.id }, data: { status: "suspended", suspendedAt: new Date() } });
  await logAudit({ actorId: user.id, action: "AFFILIATE_CONSENT_WITHDRAWN", targetType: "affiliate", targetId: affiliate.id });
  await filePrivacyRequest({ userId: user.id, type: "consent_withdrawal", details: "Affiliate Program participation" });
  revalidatePath("/settings/privacy");
  revalidatePath("/affiliate");
  return ok(undefined, "You've been withdrawn from the Affiliate Program. New commissions will no longer generate.");
}

/* ---------------- admin ---------------- */

export async function adminResolvePrivacyRequestAction(id: string, status: "in_progress" | "completed" | "rejected", resolutionNote: string) {
  const admin = await requirePlatformAdmin();
  if (!resolutionNote.trim()) return fail("A resolution note is required — this becomes part of the compliance record.");
  const request = await db.privacyRequest.update({
    where: { id },
    data: {
      status,
      resolutionNote: resolutionNote.trim(),
      resolvedById: admin.id,
      resolvedAt: status === "in_progress" ? null : new Date(),
    },
  });
  await logAudit({
    actorId: admin.id,
    action: "PRIVACY_REQUEST_RESOLVED",
    targetType: "privacyRequest",
    targetId: request.id,
    metadata: { status },
  });
  revalidatePath("/admin/privacy-requests");
  return ok(undefined, "Request updated");
}
