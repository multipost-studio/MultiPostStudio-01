import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DEFAULT_BRANDING_CONFIG, normalizeBrandingConfig, type BrandingConfig } from "./config";

/** SystemSetting key owned by the branding module. Reusing that table means no migration. */
export const BRANDING_CONFIG_KEY = "site_branding";

const TTL_MS = 30_000;
let cached: { at: number; config: BrandingConfig } | null = null;

/**
 * Saved branding, or the defaults. Never throws: the root layout, footer and
 * invoices all read this, so a database blip or a damaged row must not take pages down.
 * Cached briefly in-process (a save clears it on this instance; others catch up in 30s).
 */
export async function loadBranding(): Promise<BrandingConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  try {
    const row = await db.systemSetting.findUnique({ where: { key: BRANDING_CONFIG_KEY }, select: { value: true } });
    const config = row ? normalizeBrandingConfig(JSON.parse(row.value) as unknown) : DEFAULT_BRANDING_CONFIG;
    cached = { at: Date.now(), config };
    return config;
  } catch (err) {
    logger.warn({ err }, "branding load failed; using defaults");
    return DEFAULT_BRANDING_CONFIG;
  }
}

export async function saveBranding(config: BrandingConfig, updatedBy: string): Promise<void> {
  const value = JSON.stringify(config);
  await db.systemSetting.upsert({
    where: { key: BRANDING_CONFIG_KEY },
    create: { key: BRANDING_CONFIG_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
  cached = null;
}

export async function resetBranding(): Promise<void> {
  await db.systemSetting.deleteMany({ where: { key: BRANDING_CONFIG_KEY } });
  cached = null;
}
