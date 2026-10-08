import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DEFAULT_FOOTER_CONFIG, normalizeFooterConfig, type FooterConfig } from "./config";

/** SystemSetting key owned by the footer module. Reusing that table means no migration. */
export const FOOTER_CONFIG_KEY = "footer_config";

const TTL_MS = 30_000;
let cached: { at: number; config: FooterConfig } | null = null;

/**
 * Saved footer, or the defaults. Never throws: the public footer renders on every
 * marketing page, so a database blip or a damaged row must not take pages down.
 * Cached briefly in-process (saves clear it on this instance; others catch up in 30s).
 */
export async function loadFooterConfig(): Promise<FooterConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  try {
    const row = await db.systemSetting.findUnique({ where: { key: FOOTER_CONFIG_KEY }, select: { value: true } });
    const config = row ? normalizeFooterConfig(JSON.parse(row.value) as unknown) : DEFAULT_FOOTER_CONFIG;
    cached = { at: Date.now(), config };
    return config;
  } catch (err) {
    logger.warn({ err }, "footer config load failed; using defaults");
    return DEFAULT_FOOTER_CONFIG;
  }
}

export async function saveFooterConfig(config: FooterConfig, updatedBy: string): Promise<void> {
  const value = JSON.stringify(config);
  await db.systemSetting.upsert({
    where: { key: FOOTER_CONFIG_KEY },
    create: { key: FOOTER_CONFIG_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
  cached = null;
}

export async function resetFooterConfig(): Promise<void> {
  await db.systemSetting.deleteMany({ where: { key: FOOTER_CONFIG_KEY } });
  cached = null;
}
