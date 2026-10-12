import { db } from "@/lib/db";
import { createNotification, createForWorkspace, type NotifyInput } from "@/lib/notifications/service";

/**
 * While an administrator is viewing as a customer, the session's user is the customer, so anything logged would name
 * the customer as the actor. This returns the real administrator's id (or null) so the record can say who really acted.
 * Outside a request (cron, workers, tests) there is no session and it returns null.
 */
async function impersonatorId(): Promise<string | null> {
  try {
    const { getCurrentUser } = await import("@/lib/session");
    const user = await getCurrentUser();
    return user?.isImpersonated ? (user.impersonatorAdmin?.id ?? null) : null;
  } catch {
    return null;
  }
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
  const by = await impersonatorId();
  return db.activityEvent.create({ data: by ? { ...input, summary: `${input.summary} (support session, admin ${by})` } : input });
}

/** Append an immutable audit-log row (org-level, compliance). */
export async function logAudit(input: {
  orgId?: string | null;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: unknown;
  /** The written reason for a sensitive action; stored inside the metadata as `reason`. */
  reason?: string;
  ip?: string | null;
}) {
  const metadata = input.reason ? { ...(input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? (input.metadata as Record<string, unknown>) : input.metadata != null ? { value: input.metadata } : {}), reason: input.reason } : input.metadata;
  // Say who really acted when an administrator is viewing as the customer named in actorId.
  const by = await impersonatorId();
  const stamped =
    by && input.actorId !== by
      ? { ...(metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>) : metadata != null ? { value: metadata } : {}), impersonatedBy: by }
      : metadata;
  return db.auditLog.create({
    data: {
      orgId: input.orgId ?? null,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: stamped ? JSON.stringify(stamped) : null,
      ip: input.ip ?? null,
    },
  });
}

/**
 * Notifications. These three helpers are the long-standing entry points every feature already calls; they
 * now delegate to the notification service (src/lib/notifications), which owns preferences, safe links,
 * de-duplication, grouping and the email policy. The optional fields let a caller attach a category, priority,
 * action label, entity, platform, dedupe key and so on; omitted, the type's registered defaults apply.
 */
type Rich = Partial<Omit<NotifyInput, "userId" | "type" | "title" | "body" | "linkUrl">>;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Create an in-app notification for a user. Returns `{ id }` when a bell entry was created, else null. */
export async function notify(input: { userId: string; type: string; title: string; body: string; linkUrl?: string } & Rich) {
  const r = await createNotification(input);
  return r.created && r.id ? { id: r.id } : null;
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
} & Pick<Rich, "entityType" | "entityId" | "dedupeKey">): Promise<string[]> {
  if (!input.text.includes("@")) return [];
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
      return lower.includes(`@${full}`) || new RegExp(`@${escapeRegExp(first)}\\b`).test(lower);
    });
  if (hit.length === 0) return [];
  await Promise.all(
    hit.map((u) =>
      createNotification({
        userId: u.id,
        workspaceId: input.workspaceId,
        type: "mention",
        title: input.title,
        body: input.body,
        linkUrl: input.linkUrl,
        actionLabel: "View",
        entityType: input.entityType,
        entityId: input.entityId,
        // Same mention in the same place only once per person, even if the comment is saved twice.
        dedupeKey: input.dedupeKey ? `${input.dedupeKey}:${u.id}` : undefined,
      }),
    ),
  );
  return hit.map((u) => u.id);
}

/** Notify every member of a workspace (used for approvals, publish results). */
export async function notifyWorkspace(
  workspaceId: string,
  n: { type: string; title: string; body: string; linkUrl?: string } & Rich,
  exceptUserId?: string,
) {
  await createForWorkspace(workspaceId, n, { exceptUserId });
}
