"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { getRealAdminUser } from "@/lib/session";
import {
  signImpersonationToken,
  verifyImpersonationToken,
  IMPERSONATION_COOKIE,
  IMPERSONATION_TTL_SECONDS,
} from "@/lib/impersonation";

const REASON_MIN = 10;
const REASON_MAX = 500;

/**
 * Start a support session as a customer.
 *
 * Read-only is the default: the administrator can look at everything the customer sees and change nothing. An edit
 * session needs a written reason (kept in the audit log), is shorter, and still cannot touch account control (members,
 * billing, connections, security settings). Only an unrestricted administrator can start either.
 */
export async function impersonateUserAction(targetUserId: string, opts: { mode?: "view" | "edit"; reason?: string } = {}) {
  const admin = await getRealAdminUser();
  if (!admin) {
    return { ok: false, error: "Only platform administrators can impersonate accounts." };
  }

  // Acting as a customer is never delegated through a role: only an unrestricted administrator may do it.
  if (admin.platformRole != null) {
    return { ok: false, error: "Only full platform administrators can impersonate accounts." };
  }

  if (targetUserId === admin.id) {
    return { ok: false, error: "You cannot impersonate your own account." };
  }

  const mode = opts.mode === "edit" ? "edit" : "view";
  const reason = typeof opts.reason === "string" ? opts.reason.trim() : "";
  if (mode === "edit" && (reason.length < REASON_MIN || reason.length > REASON_MAX)) {
    return { ok: false, error: `An edit session needs a written reason (${REASON_MIN} to ${REASON_MAX} characters).` };
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

  const now = new Date();
  const ttl = IMPERSONATION_TTL_SECONDS[mode];
  // One session at a time per administrator: starting another ends the previous one.
  await db.impersonationSession.updateMany({
    where: { adminId: admin.id, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now, revokedById: admin.id },
  });
  const session = await db.impersonationSession.create({
    data: {
      adminId: admin.id,
      targetUserId: target.id,
      mode,
      reason: reason || null,
      expiresAt: new Date(now.getTime() + ttl * 1000),
    },
    select: { id: true },
  });

  const token = signImpersonationToken(session.id, admin.id, target.id, ttl);
  const jar = await cookies();
  jar.set(IMPERSONATION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: ttl,
  });

  await logAudit({
    actorId: admin.id,
    action: "admin.impersonate_start",
    targetType: "user",
    targetId: target.id,
    reason: reason || undefined,
    metadata: { targetEmail: target.email, targetName: target.name, mode, sessionId: session.id },
  });

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/dashboard" };
}

export async function stopImpersonatingAction() {
  const admin = await getRealAdminUser();
  const jar = await cookies();
  const token = jar.get(IMPERSONATION_COOKIE)?.value;
  const imp = token ? verifyImpersonationToken(token) : null;
  jar.delete(IMPERSONATION_COOKIE);

  // End the session on the server too, so a copy of the cookie is dead from this moment.
  if (admin && imp && imp.adminId === admin.id) {
    await db.impersonationSession.updateMany({
      where: { id: imp.sid, adminId: admin.id, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: admin.id },
    });
  }

  if (admin) {
    await logAudit({
      actorId: admin.id,
      action: "admin.impersonate_stop",
      targetType: "user",
      targetId: imp?.targetUserId ?? admin.id,
      metadata: imp ? { sessionId: imp.sid } : undefined,
    });
  }

  revalidatePath("/", "layout");
  return { ok: true, redirectTo: "/admin/users" };
}

/**
 * End every live support session on a customer's account, whoever started it. For the customer's complaint ("someone is
 * in my account") and for an administrator who left a session open. Unrestricted administrators only.
 */
export async function endSupportSessionsAction(targetUserId: string) {
  const admin = await getRealAdminUser();
  if (!admin || admin.platformRole != null) {
    return { ok: false, error: "Only full platform administrators can end support sessions." };
  }
  if (typeof targetUserId !== "string" || !targetUserId) return { ok: false, error: "Invalid request" };

  const res = await db.impersonationSession.updateMany({
    where: { targetUserId, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { revokedAt: new Date(), revokedById: admin.id },
  });
  await logAudit({
    actorId: admin.id,
    action: "admin.impersonate_revoked",
    targetType: "user",
    targetId: targetUserId,
    metadata: { sessionsEnded: res.count },
  });
  revalidatePath("/admin/users");
  return { ok: true, message: res.count === 0 ? "No live support sessions on this account." : `Ended ${res.count} support session${res.count === 1 ? "" : "s"}.` };
}
