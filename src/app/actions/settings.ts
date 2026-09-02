"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { logAudit } from "@/lib/events";

type Result = { ok: boolean; error?: string; message?: string };

const profileSchema = z.object({
  name: z.string().min(2).max(80),
  timezone: z.string().max(64),
  locale: z.string().max(10),
});

export async function updateProfileAction(_prev: unknown, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    name: formData.get("name"),
    timezone: formData.get("timezone") || "UTC",
    locale: formData.get("locale") || "en",
  });
  if (!parsed.success) return { ok: false, error: "Check your details" };
  await db.user.update({ where: { id: user.id }, data: parsed.data });
  revalidatePath("/settings/profile");
  return { ok: true, message: "Profile updated" };
}

const passwordSchema = z.object({
  current: z.string().min(1),
  next: z.string().min(8, "New password must be at least 8 characters"),
});

export async function changePasswordAction(_prev: unknown, formData: FormData): Promise<Result> {
  const user = await requireUser();
  const parsed = passwordSchema.safeParse({
    current: formData.get("current"),
    next: formData.get("next"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const record = await db.user.findUnique({ where: { id: user.id } });
  if (!record?.passwordHash || !(await bcrypt.compare(parsed.data.current, record.passwordHash))) {
    return { ok: false, error: "Current password is incorrect" };
  }
  await db.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(parsed.data.next, 10) } });
  await logAudit({ actorId: user.id, action: "auth.password_changed", targetType: "user", targetId: user.id });
  return { ok: true, message: "Password changed" };
}
