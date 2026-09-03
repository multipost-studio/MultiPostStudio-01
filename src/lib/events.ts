import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sendNotificationEmail } from "@/lib/adapters/email";

/** notification type -> NotificationPref boolean field. null = never email. */
function emailPrefField(type: string): "emailPublish" | "emailApproval" | "emailMentions" | null {
  if (type === "publish_success" || type === "publish_failed") return "emailPublish";
  if (type.startsWith("approval")) return "emailApproval";
  if (type === "mention") return "emailMentions";
  return null;
}

/** Mirror notifications to email for users who opted in (only when real email is configured). */
async function emailNotifications(rows: { userId: string; type: string; title: string; body: string; linkUrl?: string }[]) {
  if (!flags.realEmail || rows.length === 0) return;
  const emailable = rows.filter((r) => emailPrefField(r.type) !== null);
  if (emailable.length === 0) return;
  const userIds = [...new Set(emailable.map((r) => r.userId))];
  const users = await db.user.findMany({
    where: { id: { in: userIds }, deletedAt: null },
    select: { id: true, email: true, name: true, notificationPref: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  await Promise.all(
    emailable.map(async (r) => {
      const u = byId.get(r.userId);
      const field = emailPrefField(r.type);
      if (!u || !field) return;
      const pref = u.notificationPref;
      if (pref && pref[field] === false) return; // opted out
      try {
        await sendNotificationEmail({ to: u.email, name: u.name, title: r.title, body: r.body, linkUrl: r.linkUrl });
      } catch (e) {
        logger.warn({ err: e, userId: r.userId, type: r.type }, "notification email failed");
      }
    }),
  );
}

/** Append an activity event (workspace timeline). */
export async function logActivity(input: {
  workspaceId: string;
  actorId?: string | null;
  verb: string;
  entityType: string;
  entityId: string;
  summary: string;
}) {
  return db.activityEvent.create({ data: input });
}

/** Append an immutable audit-log row (org-level, compliance). */
export async function logAudit(input: {
  orgId?: string | null;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: unknown;
  ip?: string | null;
}) {
  return db.auditLog.create({
    data: {
      orgId: input.orgId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      ip: input.ip ?? null,
    },
  });
}

/** Create an in-app notification for a user. */
export async function notify(input: {
  userId: string;
  type: string;
  title: string;
  body: string;
  linkUrl?: string;
}) {
  const row = await db.notification.create({ data: input });
  await emailNotifications([input]);
  return row;
}

/**
 * Scan free text for @mentions of workspace members and notify each once.
 * Matches "@Full Name" or "@FirstName" (case-insensitive). Skips the author.
 */
export async function notifyMentions(input: {
  workspaceId: string;
  text: string;
  authorId: string;
  title: string;
  body: string;
  linkUrl?: string;
}) {
  if (!input.text.includes("@")) return;
  const members = await db.workspaceMember.findMany({
    where: { workspaceId: input.workspaceId },
    select: { user: { select: { id: true, name: true } } },
  });
  const lower = input.text.toLowerCase();
  const hit = members
    .map((m) => m.user)
    .filter((u) => u.id !== input.authorId)
    .filter((u) => {
      const full = u.name.toLowerCase();
      const first = full.split(/\s+/)[0];
      return lower.includes(`@${full}`) || new RegExp(`@${first}\\b`).test(lower);
    });
  if (hit.length === 0) return;
  await Promise.all(
    hit.map((u) => notify({ userId: u.id, type: "mention", title: input.title, body: input.body, linkUrl: input.linkUrl })),
  );
}

/** Notify every member of a workspace (used for approvals, publish results). */
export async function notifyWorkspace(
  workspaceId: string,
  n: { type: string; title: string; body: string; linkUrl?: string },
  exceptUserId?: string,
) {
  const members = await db.workspaceMember.findMany({
    where: { workspaceId },
    select: { userId: true },
  });
  const ids = members.map((m) => m.userId).filter((id) => id !== exceptUserId);
  if (ids.length === 0) return;
  await db.notification.createMany({
    data: ids.map((userId) => ({ userId, ...n })),
  });
  await emailNotifications(ids.map((userId) => ({ userId, ...n })));
}
