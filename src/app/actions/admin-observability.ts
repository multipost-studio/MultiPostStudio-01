"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { recordSystemEvent, type EventLevel, type EventSource } from "@/lib/observe";
import { ok, fail } from "./_helpers";

export async function emitDiagnosticEventAction(
  level: EventLevel,
  source: EventSource,
  message: string,
) {
  const admin = await requirePlatformAdmin();
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
  await requirePlatformAdmin();

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
  await requirePlatformAdmin();
  if (!id) return fail("Missing event ID");

  await db.systemEvent.deleteMany({
    where: { id },
  });

  revalidatePath("/admin/observability");
  revalidatePath("/admin/system");
  return ok(undefined, "Event dismissed");
}

