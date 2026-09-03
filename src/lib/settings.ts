import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { PLAN_KEYS, type PlanKey } from "@/lib/constants";

/**
 * Runtime, admin-editable site settings. Stored one-row-per-key in
 * SystemSetting (value = JSON). Read through `getSettings()` which merges the
 * DB rows over the defaults below, so a missing key always has a sane value
 * and adding a new setting never needs a migration.
 *
 * Cached in-process for 30s — admin edits call `invalidateSettings()`.
 */

export type SiteSettings = {
  signupEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementTone: "info" | "warning" | "success";
  defaultPlanKey: PlanKey;
  supportEmail: string;
  siteTagline: string;
  aiRateLimitPerMin: number;
};

export const SETTING_DEFAULTS: SiteSettings = {
  signupEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: "MultiPost Studio is down for scheduled maintenance. Back shortly.",
  announcementEnabled: false,
  announcementText: "",
  announcementTone: "info",
  defaultPlanKey: "free",
  supportEmail: "support@multipoststudio.app",
  siteTagline: "Plan, create, publish, engage and analyze — every platform, one workspace.",
  aiRateLimitPerMin: 20,
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SiteSettings)[];

let cache: { at: number; value: SiteSettings } | null = null;
const TTL_MS = 30_000;

function coerce(partial: Record<string, unknown>): SiteSettings {
  const merged = { ...SETTING_DEFAULTS, ...partial } as SiteSettings;
  // guardrails on the free-form values
  if (!PLAN_KEYS.includes(merged.defaultPlanKey)) merged.defaultPlanKey = "free";
  if (!["info", "warning", "success"].includes(merged.announcementTone)) merged.announcementTone = "info";
  merged.aiRateLimitPerMin = Math.min(500, Math.max(1, Number(merged.aiRateLimitPerMin) || 20));
  merged.signupEnabled = !!merged.signupEnabled;
  merged.maintenanceMode = !!merged.maintenanceMode;
  merged.announcementEnabled = !!merged.announcementEnabled;
  return merged;
}

export async function getSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await db.systemSetting.findMany();
  } catch {
    return SETTING_DEFAULTS; // DB not reachable (e.g. build) — safe defaults
  }
  const obj: Record<string, unknown> = {};
  for (const r of rows) obj[r.key] = parseJson<unknown>(r.value, undefined);
  const value = coerce(obj);
  cache = { at: Date.now(), value };
  return value;
}

export function invalidateSettings() {
  cache = null;
}

/** Persist a partial patch. Only known keys are written. */
export async function writeSettings(patch: Partial<SiteSettings>, actorId?: string) {
  const entries = Object.entries(patch).filter(([k]) => SETTING_KEYS.includes(k as keyof SiteSettings));
  await db.$transaction(
    entries.map(([key, val]) =>
      db.systemSetting.upsert({
        where: { key },
        create: { key, value: JSON.stringify(val), updatedBy: actorId ?? null },
        update: { value: JSON.stringify(val), updatedBy: actorId ?? null },
      }),
    ),
  );
  invalidateSettings();
}
