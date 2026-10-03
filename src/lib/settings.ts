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

  // Affiliate program (real-money commissions — see lib/affiliates.ts).
  // These are seed defaults applied to a newly-approved affiliate; each
  // affiliate's own rate/threshold/etc. can still be edited individually.
  affiliateEnabled: boolean;
  affiliateApplicationRequired: boolean; // false = anyone can start earning immediately on approval-free signup
  affiliateAutoApprove: boolean; // only takes effect when applicationRequired is true
  affiliateDefaultCommissionType: "percent_recurring" | "percent_once" | "fixed_recurring" | "fixed_once";
  affiliateDefaultCommissionRate: number; // percent, 0-100
  affiliateDefaultFixedAmount: number; // minor units
  affiliateDefaultRecurringMonths: number; // 0 = unlimited
  affiliateDefaultCookieDays: number;
  affiliateDefaultPayoutThreshold: number; // minor units

  // Transactional email copy ({name}, {link} placeholders)
  emailVerifySubject: string;
  emailVerifyBody: string;
  emailResetSubject: string;
  emailResetBody: string;
};

export const SETTING_DEFAULTS: SiteSettings = {
  signupEnabled: true,
  maintenanceMode: false,
  maintenanceMessage: "MultiPost Studio is down for scheduled maintenance. Back shortly.",
  announcementEnabled: false,
  announcementText: "",
  announcementTone: "info",
  defaultPlanKey: "free",
  supportEmail: "multipoststudio@gmail.com",
  siteTagline: "Plan, create, publish, engage and analyze — every platform, one workspace.",
  aiRateLimitPerMin: 20,

  affiliateEnabled: false,
  affiliateApplicationRequired: true,
  affiliateAutoApprove: false,
  affiliateDefaultCommissionType: "percent_recurring",
  affiliateDefaultCommissionRate: 20,
  affiliateDefaultFixedAmount: 0,
  affiliateDefaultRecurringMonths: 12,
  affiliateDefaultCookieDays: 30,
  affiliateDefaultPayoutThreshold: 5000,

  emailVerifySubject: "Verify your email",
  emailVerifyBody: "Hi {name}, confirm your email address to finish setting up your account:\n{link}",
  emailResetSubject: "Reset your password",
  emailResetBody: "Hi {name}, use this link to set a new password (valid for one hour):\n{link}",
};

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as (keyof SiteSettings)[];

let cache: { at: number; value: SiteSettings } | null = null;
const TTL_MS = 30_000;

function coerce(partial: Record<string, unknown>): SiteSettings {
  const merged = { ...SETTING_DEFAULTS, ...partial } as SiteSettings;
  // guardrails on the free-form values
  if (!PLAN_KEYS.includes(merged.defaultPlanKey)) merged.defaultPlanKey = "free";
  if (!["info", "warning", "success"].includes(merged.announcementTone)) merged.announcementTone = "info";
  if (!["percent_recurring", "percent_once", "fixed_recurring", "fixed_once"].includes(merged.affiliateDefaultCommissionType)) {
    merged.affiliateDefaultCommissionType = "percent_recurring";
  }
  merged.aiRateLimitPerMin = clampInt(merged.aiRateLimitPerMin, 1, 500, 20);
  merged.affiliateDefaultCommissionRate = clampInt(merged.affiliateDefaultCommissionRate, 0, 100, 20);
  merged.affiliateDefaultFixedAmount = clampInt(merged.affiliateDefaultFixedAmount, 0, 100_000_000, 0);
  merged.affiliateDefaultRecurringMonths = clampInt(merged.affiliateDefaultRecurringMonths, 0, 120, 12);
  merged.affiliateDefaultCookieDays = clampInt(merged.affiliateDefaultCookieDays, 1, 365, 30);
  merged.affiliateDefaultPayoutThreshold = clampInt(merged.affiliateDefaultPayoutThreshold, 0, 100_000_000, 5000);
  merged.signupEnabled = !!merged.signupEnabled;
  merged.maintenanceMode = !!merged.maintenanceMode;
  merged.announcementEnabled = !!merged.announcementEnabled;
  merged.affiliateEnabled = !!merged.affiliateEnabled;
  merged.affiliateApplicationRequired = !!merged.affiliateApplicationRequired;
  merged.affiliateAutoApprove = !!merged.affiliateAutoApprove;
  return merged;
}

function clampInt(v: unknown, min: number, max: number, dflt: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
}

export async function getSettings(): Promise<SiteSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let rows: { key: string; value: string }[] = [];
  try {
    rows = await db.systemSetting.findMany();
  } catch {
    cache = { at: Date.now(), value: SETTING_DEFAULTS };
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
