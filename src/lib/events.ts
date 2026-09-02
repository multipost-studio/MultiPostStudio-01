import { db } from "@/lib/db";

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
  return db.notification.create({ data: input });
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
}
