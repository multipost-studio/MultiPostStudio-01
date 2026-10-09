"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { invalidateFeatureFlags } from "@/lib/feature-flags";
import { parseFlagImport, planFlagImport, type FlagChange } from "@/lib/admin-exports/flags-import";

export type FlagImportResult =
  | { ok: true; applied: boolean; created: number; updated: number; unchanged: number; changes: FlagChange[] }
  | { ok: false; errors: string[] };

const MAX_BYTES = 1_000_000;

/**
 * Import feature flags from the JSON or CSV this page exports.
 * Call with `apply: false` first for a dry run (what would be created or changed),
 * then with `apply: true` to commit. Validation is all-or-nothing; fields left out of
 * the file keep their current value; nothing is ever deleted.
 */
export async function importFeatureFlagsAction(text: string, apply: boolean): Promise<FlagImportResult> {
  const admin = await requireAdminPermission("flags.manage");
  if (typeof text !== "string" || text.length === 0) return { ok: false, errors: ["The file is empty."] };
  if (text.length > MAX_BYTES) return { ok: false, errors: ["The file is larger than 1 MB."] };

  const parsed = parseFlagImport(text);
  if (!parsed.ok) return parsed;

  try {
    const existing = await db.featureFlag.findMany({ where: { key: { in: parsed.flags.map((f) => f.key) } }, select: { key: true, description: true, enabled: true, rollout: true } });
    const { changes, unchanged } = planFlagImport(parsed.flags, existing);
    const created = changes.filter((c) => c.kind === "create").length;
    const updated = changes.length - created;

    if (apply && changes.length > 0) {
      const byKey = new Map(parsed.flags.map((f) => [f.key, f]));
      await db.$transaction(
        changes.map((c) => {
          const f = byKey.get(c.key)!;
          return db.featureFlag.upsert({
            where: { key: c.key },
            create: { key: c.key, description: f.description ?? "", enabled: f.enabled ?? false, rollout: f.rollout ?? 0 },
            update: {
              ...(f.description !== null ? { description: f.description } : {}),
              ...(f.enabled !== null ? { enabled: f.enabled } : {}),
              ...(f.rollout !== null ? { rollout: f.rollout } : {}),
            },
          });
        }),
      );
      invalidateFeatureFlags();
      await logAudit({
        actorId: admin.id,
        action: "admin.flags_imported",
        targetType: "system",
        targetId: "feature_flags",
        metadata: { created, updated, unchanged, keys: changes.map((c) => c.key).slice(0, 100) },
      });
      revalidatePath("/admin/flags");
    }
    return { ok: true, applied: apply && changes.length > 0, created, updated, unchanged, changes };
  } catch (err) {
    logger.error({ err }, "import feature flags failed");
    return { ok: false, errors: ["Couldn't import the flags. Nothing was changed."] };
  }
}
