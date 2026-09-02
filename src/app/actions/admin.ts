"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";

export async function toggleFeatureFlagAction(id: string, enabled: boolean) {
  await requirePlatformAdmin();
  await db.featureFlag.update({ where: { id }, data: { enabled } });
  revalidatePath("/admin/flags");
  return { ok: true };
}

export async function setFlagRolloutAction(id: string, rollout: number) {
  await requirePlatformAdmin();
  await db.featureFlag.update({ where: { id }, data: { rollout: Math.max(0, Math.min(100, rollout)) } });
  revalidatePath("/admin/flags");
  return { ok: true };
}

export async function updatePlanAction(id: string, data: { priceMonthly?: number; maxChannels?: number; maxUsers?: number; aiCredits?: number }) {
  await requirePlatformAdmin();
  await db.plan.update({
    where: { id },
    data: {
      ...(data.priceMonthly !== undefined ? { priceMonthly: data.priceMonthly } : {}),
      ...(data.maxChannels !== undefined ? { maxChannels: data.maxChannels } : {}),
      ...(data.maxUsers !== undefined ? { maxUsers: data.maxUsers } : {}),
      ...(data.aiCredits !== undefined ? { aiCredits: data.aiCredits } : {}),
    },
  });
  revalidatePath("/admin/plans");
  return { ok: true, message: "Plan updated" };
}

export async function setUserAdminAction(userId: string, isAdmin: boolean) {
  const admin = await requirePlatformAdmin();
  if (userId === admin.id) return { ok: false, error: "You can't change your own admin status" };
  await db.user.update({ where: { id: userId }, data: { isPlatformAdmin: isAdmin } });
  await logAudit({ actorId: admin.id, action: "admin.user_admin_changed", targetType: "user", targetId: userId, metadata: { isAdmin } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function updateTicketStatusAction(id: string, status: "open" | "pending" | "resolved" | "closed") {
  await requirePlatformAdmin();
  await db.supportTicket.update({ where: { id }, data: { status } });
  revalidatePath("/admin/support");
  return { ok: true };
}

export async function setOrgSuspendedAction(orgId: string, suspended: boolean) {
  const admin = await requirePlatformAdmin();
  await db.membership.updateMany({
    where: { orgId },
    data: { status: suspended ? "suspended" : "active" },
  });
  await logAudit({ orgId, actorId: admin.id, action: suspended ? "admin.org_suspended" : "admin.org_restored", targetType: "organization", targetId: orgId });
  revalidatePath("/admin/orgs");
  return { ok: true };
}
