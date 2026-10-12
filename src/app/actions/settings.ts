"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { IMPERSONATION_BLOCKED_MESSAGE } from "@/lib/impersonation";
import { logAudit } from "@/lib/events";
import { notifySecurityEvent } from "@/lib/notifications/security-notify";
import { isValidTimezone } from "@/lib/timezones";

type Result = { ok: boolean; error?: string; message?: string };

const profileSchema = z.object({
  name: z.string().trim().min(2, "Enter your name").max(80, "That name is too long"),
  timezone: z.string().refine(isValidTimezone, "Choose a valid time zone"),
});

export async function updateProfileAction(_prev: unknown, formData: FormData): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone") || "UTC",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check your details" };
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  // The zone feeds analytics days, the calendar, best-time suggestions and streaks on every page.
  revalidatePath("/", "layout");
  return { ok: true, message: "Profile updated" };
}

const passwordSchema = z.object({
  current: z.string().min(1).optional(),
  next: z.string().min(8, "New password must be at least 8 characters"),
});

export async function changePasswordAction(_prev: unknown, formData: FormData): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  const parsed = passwordSchema.safeParse({
    current: formData.get("current") || undefined,
    next: formData.get("next"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (record?.passwordHash) {
    // Existing password: prove it. Google-only accounts (no passwordHash
    // yet) may set their first password on session alone — Google sign-in
    // already proved inbox ownership, and having a password is what unlocks
    // 2FA enrollment for them.
    if (!parsed.data.current || !(await bcrypt.compare(parsed.data.current, record.passwordHash))) {
      return { ok: false, error: "Current password is incorrect" };
    }
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.next, 12) } });
  // A stolen session token otherwise keeps working after the password that
  // was meant to kill it changes — the JWT strategy means the token itself
  // stays valid until its bound Device row is revoked (see deviceSessionValid
  // in auth.ts). Sign out everywhere, including this session; the user just
  // proved their password and can log back in immediately.
  await db.device.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await logAudit({ actorId: user.id, action: "auth.password_changed", targetType: "user", targetId: user.id });
  await notifySecurityEvent(user.id, "password_changed");
  return { ok: true, message: "Password changed — you've been signed out everywhere for security" };
}
