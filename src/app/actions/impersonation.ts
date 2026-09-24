"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { getRealAdminUser } from "@/lib/session";
import { signImpersonationToken, IMPERSONATION_COOKIE } from "@/lib/impersonation";

export async function impersonateUserAction(targetUserId: string) {
  const admin = await getRealAdminUser();
  if (!admin) {
    return { ok: false, error: "Only platform administrators can impersonate accounts." };
  }

  if (targetUserId === admin.id) {
    return { ok: false, error: "You cannot impersonate your own account." };
  }

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true, name: true, isPlatformAdmin: true, suspendedAt: true, deletedAt: true },
  });

  if (!target) {
    return { ok: false, error: "Target user not found." };
  }

  if (target.isPlatformAdmin) {
    return { ok: false, error: "Security restriction: You cannot impersonate another platform administrator." };
  }

  if (target.suspendedAt || target.deletedAt) {
    return { ok: false, error: "Cannot impersonate a suspended or deleted account." };
  }

  const token = signImpersonationToken(admin.id, target.id);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 3600,
  });

  await logAudit({
    actorId: admin.id,
    action: "admin.impersonate_start",
    targetType: "user",
    targetId: target.id,
    metadata: { targetEmail: target.email, targetName: target.name },
  });

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/dashboard" };
}

export async function stopImpersonatingAction() {
  const admin = await getRealAdminUser();
  const jar = await cookies();
  jar.delete(IMPERSONATION_COOKIE);

  if (admin) {
    await logAudit({
      actorId: admin.id,
      action: "admin.impersonate_stop",
      targetType: "user",
      targetId: admin.id,
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/admin/users" };
}
