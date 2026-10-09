"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireWorkspace } from "@/lib/session";
import { logger } from "@/lib/logger";
import {
  deleteNotification,
  getUnreadCount,
  isFilter,
  markAllAsRead,
  markAsRead,
  markAsUnread,
  type NotificationFilter,
} from "@/lib/notifications/service";
import { parseSettings, serializeSettings } from "@/lib/notifications/prefs";

/**
 * Notification mutations. Every one resolves the signed-in user (and their active workspace) itself and puts
 * the user id in the database WHERE clause, so an id belonging to someone else matches nothing. Opening the
 * bell never calls any of these; only a click, "mark all read" or a settings change does.
 * An admin impersonating a customer can look but not change: read state is the customer's own.
 */

type Result = { ok: boolean; message?: string; unread?: number };

const idSchema = z.string().min(1).max(64);

async function scope() {
  const ctx = await requireWorkspace();
  return { userId: ctx.user.id, workspaceId: ctx.active.workspace.id, readOnly: ctx.user.isImpersonated === true };
}

function refresh() {
  // The sidebar badge and the bell read the count in the app layout.
  revalidatePath("/notifications");
  revalidatePath("/dashboard");
}

export async function markNotificationReadAction(id: string): Promise<Result> {
  const s = await scope();
  if (s.readOnly || !idSchema.safeParse(id).success) return { ok: false };
  await markAsRead(s.userId, id);
  refresh();
  return { ok: true, unread: await getUnreadCount(s) };
}

export async function markNotificationUnreadAction(id: string): Promise<Result> {
  const s = await scope();
  if (s.readOnly || !idSchema.safeParse(id).success) return { ok: false };
  await markAsUnread(s.userId, id);
  refresh();
  return { ok: true, unread: await getUnreadCount(s) };
}

export async function markAllNotificationsReadAction(filter?: string): Promise<Result> {
  const s = await scope();
  if (s.readOnly) return { ok: false };
  const f: NotificationFilter = isFilter(filter) ? filter : "all";
  await markAllAsRead(s, f);
  refresh();
  return { ok: true, unread: await getUnreadCount(s) };
}

export async function deleteNotificationAction(id: string): Promise<Result> {
  const s = await scope();
  if (s.readOnly || !idSchema.safeParse(id).success) return { ok: false };
  await deleteNotification(s.userId, id);
  refresh();
  return { ok: true, unread: await getUnreadCount(s) };
}

const prefsSchema = z.object({
  emailPublish: z.boolean(),
  emailApproval: z.boolean(),
  emailMentions: z.boolean(),
  emailWeeklyDigest: z.boolean(),
  emailReports: z.boolean(),
  inappAll: z.boolean(),
  // Validated and clamped by parseSettings; anything unexpected falls back to defaults.
  settings: z.unknown(),
});

export async function saveNotificationPrefsAction(input: unknown): Promise<Result> {
  const s = await scope();
  if (s.readOnly) return { ok: false, message: "Preferences can't be changed while viewing as another user" };
  const parsed = prefsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Those preferences couldn't be saved. Reload the page and try again." };
  const { settings, ...flags } = parsed.data;
  const json = serializeSettings(parseSettings(typeof settings === "string" ? settings : JSON.stringify(settings ?? {})));
  try {
    await db.notificationPref.upsert({
      where: { userId: s.userId },
      create: { userId: s.userId, ...flags, settings: json },
      update: { ...flags, settings: json },
    });
  } catch (err) {
    logger.error({ err, userId: s.userId }, "saving notification preferences failed");
    return { ok: false, message: "Couldn't save your preferences. Please try again." };
  }
  revalidatePath("/settings/notifications");
  return { ok: true, message: "Notification preferences saved" };
}
