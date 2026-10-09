"use server";

import { revalidatePath } from "next/cache";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { DEFAULT_FESTIVAL_CONFIG, MAX_IMPORT_BYTES, parseFestivalConfig } from "@/lib/festivals/config";
import { FESTIVAL_CONFIG_KEY, loadFestivalConfig, resetFestivalConfig, saveFestivalConfig } from "@/lib/festivals/store";
import type { FestivalConfig } from "@/lib/festivals/types";

export type FestivalConfigResult = { ok: true; config: FestivalConfig; message: string } | { ok: false; errors: string[] };

async function apply(config: FestivalConfig, actorId: string, action: string, message: string): Promise<FestivalConfigResult> {
  const before = await loadFestivalConfig();
  await saveFestivalConfig(config, actorId);
  await logAudit({ actorId, action, targetType: "system", targetId: FESTIVAL_CONFIG_KEY, metadata: { before, after: config } });
  revalidatePath("/admin/festivals");
  return { ok: true, config, message };
}

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Save the whole festival configuration. Validated strictly: nothing is saved if anything is wrong. */
export async function saveFestivalConfigAction(input: unknown): Promise<FestivalConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const parsed = parseFestivalConfig(input);
    if (!parsed.ok) return parsed;
    return await apply(parsed.config, admin.id, "admin.festival_config_updated", "Festival settings saved");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "save festival config failed");
    return { ok: false, errors: ["Couldn't save the festival settings."] };
  }
}

/** Import a config exported from this page (or another environment). All-or-nothing. */
export async function importFestivalConfigAction(text: string): Promise<FestivalConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    if (typeof text !== "string" || text.length === 0) return { ok: false, errors: ["The file is empty."] };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, errors: [`The file is larger than ${MAX_IMPORT_BYTES / 1000} KB.`] };
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return { ok: false, errors: ["The file is not valid JSON."] };
    }
    // Accept the export envelope as well as a bare config object.
    const candidate = raw && typeof raw === "object" && "config" in raw && !("autoMode" in raw) ? (raw as { config: unknown }).config : raw;
    const parsed = parseFestivalConfig(candidate);
    if (!parsed.ok) return parsed;
    return await apply(parsed.config, admin.id, "admin.festival_config_imported", "Festival settings imported");
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "import festival config failed");
    return { ok: false, errors: ["Couldn't save the imported settings."] };
  }
}

/** Back to the defaults: everything off until an admin opts in again. */
export async function resetFestivalConfigAction(): Promise<FestivalConfigResult> {
  try {
    const admin = await requireAdminPermission("marketing.manage");
    const before = await loadFestivalConfig();
    await resetFestivalConfig();
    await logAudit({ actorId: admin.id, action: "admin.festival_config_reset", targetType: "system", targetId: FESTIVAL_CONFIG_KEY, metadata: { before } });
    revalidatePath("/admin/festivals");
    return { ok: true, config: DEFAULT_FESTIVAL_CONFIG, message: "Festival settings reset to defaults" };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "reset festival config failed");
    return { ok: false, errors: ["Couldn't reset the settings."] };
  }
}
