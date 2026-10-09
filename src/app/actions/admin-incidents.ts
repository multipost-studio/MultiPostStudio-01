"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { createNotification } from "@/lib/notifications/service";
import { INCIDENT_STATUSES, POSTMORTEM_MAX, TITLE_MAX, isIncidentKey } from "@/lib/incident-records";

/**
 * Ownership and postmortem for a health incident. Health incidents are derived from probe history and have no row until
 * someone takes them on, so the first save creates the record. Every change is audited with what it was and what it became;
 * the postmortem text itself stays in IncidentRecord (it can mention customers) and is not copied into the audit log.
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const input = z.object({
  key: z.string(),
  title: z.string().trim().min(1).max(TITLE_MAX),
  ownerId: z.string().min(1).max(64).nullable(),
  status: z.enum(INCIDENT_STATUSES.map((s) => s.id) as [string, ...string[]]),
  postmortem: z.string().max(POSTMORTEM_MAX, `A postmortem can be up to ${POSTMORTEM_MAX} characters`).nullable(),
});

export async function updateIncidentAction(raw: unknown): Promise<Result> {
  const admin = await requireAdminPermission("system.manage");
  const p = input.safeParse(raw);
  if (!p.success || !isIncidentKey(p.data.key)) return fail(p.success ? "That isn't a valid incident" : (p.error.issues[0]?.message ?? "Invalid request"));
  const { key, title, ownerId, status } = p.data;
  const postmortem = p.data.postmortem?.trim() ? p.data.postmortem.trim() : null;

  if (ownerId) {
    const owner = await db.user.findUnique({ where: { id: ownerId }, select: { isPlatformAdmin: true, suspendedAt: true, deletedAt: true } });
    if (!owner || !owner.isPlatformAdmin || owner.suspendedAt || owner.deletedAt) return fail("The owner must be an active member of staff");
  }

  const before = await db.incidentRecord.findUnique({ where: { key }, select: { ownerId: true, status: true, postmortem: true } });
  const postmortemChanged = (before?.postmortem ?? null) !== postmortem;
  const data = {
    title,
    ownerId,
    status,
    postmortem,
    ...(postmortemChanged ? { postmortemAt: postmortem ? new Date() : null, postmortemById: postmortem ? admin.id : null } : {}),
  };
  await db.incidentRecord.upsert({ where: { key }, create: { key, ...data }, update: data });

  await logAudit({
    actorId: admin.id,
    action: "admin.incident_updated",
    targetType: "incident",
    targetId: key,
    metadata: { status: { from: before?.status ?? null, to: status }, owner: { from: before?.ownerId ?? null, to: ownerId }, postmortem: postmortemChanged ? (postmortem ? "written" : "removed") : "unchanged" },
  });

  // Tell a new owner they have been given it (not when you assign it to yourself).
  if (ownerId && ownerId !== (before?.ownerId ?? null) && ownerId !== admin.id) {
    await createNotification({
      userId: ownerId,
      type: "system",
      title: "You own a health incident",
      body: `${title} was assigned to you.`,
      linkUrl: "/admin/health?tab=incidents",
      noEmail: true,
    }).catch((err) => logger.warn({ err }, "incident owner notification failed"));
  }
  revalidatePath("/admin/health");
  return { ok: true, message: "Incident updated" };
}
