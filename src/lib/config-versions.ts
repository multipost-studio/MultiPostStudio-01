import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * Every write to an admin-managed JSON config (branding, footer, festival themes, review settings, health settings) goes
 * through writeConfig / deleteConfig, which save the value exactly as before AND keep the previous value as a revision, so
 * staff can see what changed and restore an earlier version (see /admin/config-history).
 *
 * Recording a revision is best effort: it must never block the save it describes, so a failure (for example the table
 * not being migrated yet) is logged and the save still succeeds. An empty `after` means the config was reset to defaults.
 */
export const REVISIONS_KEPT_PER_KEY = 50;

type Meta = { reason?: string; restoredFromId?: string };
const context = new AsyncLocalStorage<Meta>();

/** Run `fn` so any config write inside it is recorded as a restore of `restoredFromId`, with `reason`. */
export function withRevisionMeta<T>(meta: Meta, fn: () => Promise<T>): Promise<T> {
  return context.run(meta, fn);
}

async function record(key: string, before: string | null, after: string, actorId: string | null): Promise<void> {
  if ((before ?? "") === after) return;
  try {
    const meta = context.getStore();
    await db.configRevision.create({ data: { key, before, after, actorId, reason: meta?.reason ?? null, restoredFromId: meta?.restoredFromId ?? null } });
    const stale = await db.configRevision.findMany({ where: { key }, orderBy: { createdAt: "desc" }, skip: REVISIONS_KEPT_PER_KEY, select: { id: true } });
    if (stale.length > 0) await db.configRevision.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  } catch (err) {
    logger.warn({ err, key }, "config revision not recorded");
  }
}

/** The current stored text, or null. Never throws: reading the old value is only for the history. */
async function readRaw(key: string): Promise<{ value: string } | null> {
  try {
    return (await db.systemSetting.findUnique({ where: { key }, select: { value: true } })) ?? null;
  } catch {
    return null;
  }
}

export async function writeConfig(key: string, value: string, updatedBy: string): Promise<void> {
  const before = await readRaw(key);
  await db.systemSetting.upsert({ where: { key }, create: { key, value, updatedBy }, update: { value, updatedBy } });
  await record(key, before?.value ?? null, value, updatedBy);
}

export async function deleteConfig(key: string, updatedBy: string | null = null): Promise<void> {
  const before = await readRaw(key);
  await db.systemSetting.deleteMany({ where: { key } });
  if (before) await record(key, before.value, "", updatedBy);
}
