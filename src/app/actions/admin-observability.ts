"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { recordSystemEvent, type EventLevel, type EventSource } from "@/lib/observe";
import { ok, fail } from "./_helpers";

export async function emitDiagnosticEventAction(
  level: EventLevel,
  source: EventSource,
  message: string,
) {
  const admin = await requireAdminPermission("system.manage");
  if (!message.trim()) return fail("Message cannot be empty");

  await recordSystemEvent({
    level,
    source,
    message: message.trim(),
    meta: { triggeredByAdminId: admin.id, manualDiagnostic: true },
  });

  revalidatePath("/admin/observability");
  revalidatePath("/admin/system");
  return ok(undefined, "Diagnostic event recorded to telemetry stream");
}

export type PurgeEventsOptions = {
  olderThanHours?: number;
  olderThanDays?: number;
  onlyErrors?: boolean;
  clearAll?: boolean;
};

export async function clearSystemEventsAction(options: PurgeEventsOptions = {}) {
  const admin = await requireAdminPermission("system.manage");

  const where: {
    createdAt?: { lt: Date };
    level?: string;
  } = {};

  if (options.clearAll) {
    if (options.onlyErrors) {
      where.level = "error";
    }
  } else if (options.olderThanHours !== undefined) {
    where.createdAt = { lt: new Date(Date.now() - options.olderThanHours * 3_600_000) };
    if (options.onlyErrors) where.level = "error";
  } else if (options.olderThanDays !== undefined) {
    where.createdAt = { lt: new Date(Date.now() - options.olderThanDays * 86_400_000) };
    if (options.onlyErrors) where.level = "error";
  }

  const result = await db.systemEvent.deleteMany({ where });
  // Deleting telemetry removes evidence of what happened, so the deletion itself is recorded.
  await logAudit({
    actorId: admin.id,
    action: "admin.system_events_purged",
    targetType: "systemEvent",
    targetId: "bulk",
    metadata: { deleted: result.count, clearAll: !!options.clearAll, onlyErrors: !!options.onlyErrors, olderThanHours: options.olderThanHours ?? null, olderThanDays: options.olderThanDays ?? null },
  }).catch(() => undefined);

  revalidatePath("/admin/observability");
  revalidatePath("/admin/system");

  const filterDesc = options.onlyErrors ? "critical error" : "telemetry";
  const scopeDesc = options.clearAll
    ? "all"
    : options.olderThanHours !== undefined
      ? `older than ${options.olderThanHours}h`
      : options.olderThanDays !== undefined
        ? `older than ${options.olderThanDays}d`
        : "";

  return ok(
    result.count,
    `Purged ${result.count} ${scopeDesc ? `${scopeDesc} ` : ""}${filterDesc} events`,
  );
}

export async function purgeOldSystemEventsAction(olderThanDays = 30) {
  return clearSystemEventsAction({ olderThanDays });
}

export async function deleteSystemEventAction(id: string) {
  const admin = await requireAdminPermission("system.manage");
  if (!id) return fail("Missing event ID");

  const r = await db.systemEvent.deleteMany({
    where: { id },
  });
  if (r.count > 0) {
    await logAudit({ actorId: admin.id, action: "admin.system_event_dismissed", targetType: "systemEvent", targetId: id }).catch(() => undefined);
  }

  revalidatePath("/admin/observability");
  revalidatePath("/admin/system");
  return ok(undefined, "Event dismissed");
}

