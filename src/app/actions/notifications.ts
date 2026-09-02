"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";

export async function markNotificationReadAction(id: string) {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/dashboard");
}

export async function updateNotificationPrefsAction(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  const b = (k: string) => formData.get(k) === "on";
  await db.notificationPref.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      emailPublish: b("emailPublish"),
      emailApproval: b("emailApproval"),
      emailMentions: b("emailMentions"),
      emailWeeklyDigest: b("emailWeeklyDigest"),
      inappAll: b("inappAll"),
    },
    update: {
      emailPublish: b("emailPublish"),
      emailApproval: b("emailApproval"),
      emailMentions: b("emailMentions"),
      emailWeeklyDigest: b("emailWeeklyDigest"),
      inappAll: b("inappAll"),
    },
  });
  revalidatePath("/settings/notifications");
  return { ok: true, message: "Notification preferences saved" };
}
