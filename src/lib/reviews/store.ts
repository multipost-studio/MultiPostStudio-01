import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { DEFAULT_REVIEW_CONFIG, normalizeReviewConfig, type ReviewConfig } from "./config";

/** SystemSetting key owned by the reviews module. Reusing that table means no migration for settings. */
export const REVIEW_CONFIG_KEY = "review_config";

const TTL_MS = 30_000;
let cached: { at: number; config: ReviewConfig } | null = null;

/** Saved settings, or the defaults. Never throws: public pages read this, so a database blip must not break them. */
export async function loadReviewConfig(): Promise<ReviewConfig> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.config;
  try {
    const row = await db.systemSetting.findUnique({ where: { key: REVIEW_CONFIG_KEY }, select: { value: true } });
    const config = row ? normalizeReviewConfig(JSON.parse(row.value) as unknown) : DEFAULT_REVIEW_CONFIG;
    cached = { at: Date.now(), config };
    return config;
  } catch (err) {
    logger.warn({ err }, "review config load failed; using defaults");
    return DEFAULT_REVIEW_CONFIG;
  }
}

export async function saveReviewConfig(config: ReviewConfig, updatedBy: string): Promise<void> {
  const value = JSON.stringify(config);
  await db.systemSetting.upsert({
    where: { key: REVIEW_CONFIG_KEY },
    create: { key: REVIEW_CONFIG_KEY, value, updatedBy },
    update: { value, updatedBy },
  });
  cached = null;
}

export async function resetReviewConfig(): Promise<void> {
  await db.systemSetting.deleteMany({ where: { key: REVIEW_CONFIG_KEY } });
  cached = null;
}
