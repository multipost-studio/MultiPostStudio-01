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

export async function purgeOldSystemEventsAction(olderThanDays = 30) {
  await requirePlatformAdmin();
  const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);

  const result = await db.systemEvent.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });

  revalidatePath("/admin/observability");
  revalidatePath("/admin/system");
  return ok(result.count, `Purged ${result.count} telemetry events older than ${olderThanDays} days`);
}
