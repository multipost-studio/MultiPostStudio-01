"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/events";
import { requireAdminPermission } from "@/lib/session";
import { CHECK_KINDS, CHECK_RESULTS } from "@/lib/recovery-status";
import { MIN_DATE, parseDay } from "@/lib/date-range";

/**
 * Record that a backup was verified or a restore was tested. This app cannot see the database host's backups, so the
 * record is evidence kept by a person; it is append-only (a wrong entry is answered by a correcting one, never erased).
 */
type Result = { ok: true; message: string } | { ok: false; error: string };
const fail = (error: string): Result => ({ ok: false, error });

const input = z.object({
  kind: z.enum(CHECK_KINDS.map((k) => k.id) as [string, ...string[]]),
  result: z.enum(CHECK_RESULTS.map((r) => r.id) as [string, ...string[]]),
  occurredOn: z.string(),
  notes: z.string().trim().max(1000, "Notes can be up to 1000 characters").optional(),
});

export async function recordBackupCheckAction(raw: unknown): Promise<Result> {
  const admin = await requireAdminPermission("system.manage");
  const p = input.safeParse(raw);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Invalid request");
  const day = parseDay(p.data.occurredOn);
  if (!day) return fail("Pick a valid date");
  if (day < new Date(`${MIN_DATE}T00:00:00.000Z`)) return fail("That date is too far back");
  if (day.getTime() > Date.now()) return fail("The date can't be in the future");
  if (p.data.result === "failed" && !p.data.notes) return fail("Say what went wrong, so the next person knows");

  const row = await db.backupCheck.create({
    data: { kind: p.data.kind, result: p.data.result, occurredAt: day, notes: p.data.notes || null, recordedById: admin.id },
    select: { id: true },
  });
  await logAudit({ actorId: admin.id, action: "admin.backup_check_recorded", targetType: "backup_check", targetId: row.id, metadata: { kind: p.data.kind, result: p.data.result, occurredOn: p.data.occurredOn } });
  revalidatePath("/admin/recovery");
  return { ok: true, message: "Recorded" };
}
