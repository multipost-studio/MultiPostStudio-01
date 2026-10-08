import { db } from "@/lib/db";
import { DEFAULT_FESTIVAL_CONFIG, normalizeFestivalConfig } from "./config";
import type { FestivalConfig } from "./types";

/** SystemSetting key owned by the festival module. Reusing that table means no migration. */
export const FESTIVAL_CONFIG_KEY = "festival_config";

/** Saved config, or the defaults. Never throws: a broken row must not break the public API or a page. */
export async function loadFestivalConfig(): Promise<FestivalConfig> {
  try {
    const row = await db.systemSetting.findUnique({ where: { key: FESTIVAL_CONFIG_KEY }, select: { value: true } });
    if (!row) return DEFAULT_FESTIVAL_CONFIG;
    return normalizeFestivalConfig(JSON.parse(row.value) as unknown);
  } catch {
    return DEFAULT_FESTIVAL_CONFIG;
  }
}

export async function saveFestivalConfig(config: FestivalConfig, updatedBy: string): Promise<void> {
  const value = JSON.stringify(config);
  await db.systemSetting.upsert({
    where: { key: FESTIVAL_CONFIG_KEY },
    create: { key: FESTIVAL_CONFIG_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
}

export async function resetFestivalConfig(): Promise<void> {
  await db.systemSetting.deleteMany({ where: { key: FESTIVAL_CONFIG_KEY } });
}
