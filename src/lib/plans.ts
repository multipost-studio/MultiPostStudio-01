import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/utils";
import { PLAN_CATALOG, type PlanKey } from "@/lib/constants";

/**
 * Plans, read from the DB so admin edits in /admin/plans take effect app-wide
 * (limits, prices, feature lists, entitlements). PLAN_CATALOG is the seed and
 * the fallback when the Plan table is empty or unreachable. Cached 30s.
 */

export type PlanRow = {
  id: string;
  key: string;
  name: string;
  badge: string | null;
  currency: string;
  priceMonthly: number;
  priceAnnual: number;
  priceMonthlyInr: number;
  priceAnnualInr: number;
  annualDiscountPct: number;
  trialDays: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  analyticsRetentionDays: number;
  apiRateLimit: number;
  automationLimit: number;
  features: string[];
  entitlements: string[];
  isPublic: boolean;
  isCustom: boolean;
  sortIndex: number;
};

const FALLBACK: PlanRow[] = PLAN_CATALOG.map((p, i) => ({
  id: `catalog-${p.key}`,
  key: p.key,
  name: p.name,
  badge: p.badge ?? null,
  currency: p.currency,
  priceMonthly: p.priceMonthly,
  priceAnnual: p.priceAnnual,
  priceMonthlyInr: p.priceMonthlyInr,
  priceAnnualInr: p.priceAnnualInr,
  annualDiscountPct: p.annualDiscountPct,
  trialDays: p.trialDays,
  maxChannels: p.maxChannels,
  maxUsers: p.maxUsers,
  maxScheduled: p.maxScheduled,
  aiCredits: p.aiCredits,
  storageMb: p.storageMb,
  analyticsRetentionDays: p.analyticsRetentionDays,
  apiRateLimit: p.apiRateLimit,
  automationLimit: p.automationLimit,
  features: [...p.features],
  entitlements: [...p.entitlements],
  isPublic: p.isPublic,
  isCustom: p.isCustom,
  sortIndex: i,
}));

let cache: { at: number; value: PlanRow[] } | null = null;
const TTL_MS = 30_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapRow(r: any): PlanRow {
  return {
    id: r.id,
    key: r.key,
    name: r.name,
    badge: r.badge ?? null,
    currency: r.currency ?? "usd",
    priceMonthly: r.priceMonthly,
    priceAnnual: r.priceAnnual,
    // ?? 0 keeps this safe against a DB that predates the INR columns.
    priceMonthlyInr: r.priceMonthlyInr ?? 0,
    priceAnnualInr: r.priceAnnualInr ?? 0,
    annualDiscountPct: r.annualDiscountPct ?? 0,
    trialDays: r.trialDays ?? 0,
    maxChannels: r.maxChannels,
    maxUsers: r.maxUsers,
    maxScheduled: r.maxScheduled,
    aiCredits: r.aiCredits,
    storageMb: r.storageMb,
    analyticsRetentionDays: r.analyticsRetentionDays ?? 90,
    apiRateLimit: r.apiRateLimit ?? 0,
    automationLimit: r.automationLimit ?? 0,
    features: parseJson<string[]>(r.features, []),
    entitlements: parseJson<string[]>(r.entitlements, []),
    isPublic: r.isPublic ?? true,
    isCustom: r.isCustom ?? false,
    sortIndex: r.sortIndex ?? 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function getPlans(): Promise<PlanRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const rows = await db.plan.findMany({ orderBy: { sortIndex: "asc" } });
    if (rows.length === 0) return FALLBACK;
    const value = rows.map(mapRow);
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Falling back keeps pricing on screen, but swallowing this silently hid a
    // real failure: with the Plan table unreachable (or missing a column after
    // a pending migration) the app serves PLAN_CATALOG prices and every
    // /admin/plans edit is quietly ignored, with nothing in the logs.
    logger.error({ err }, "Plan table unreadable — serving PLAN_CATALOG fallback; admin plan edits are NOT in effect");
    return FALLBACK;
  }
}

export async function getPlan(key: string): Promise<PlanRow> {
  const plans = await getPlans();
  return (
    plans.find((p) => p.key === key) ??
    FALLBACK.find((p) => p.key === key) ??
    FALLBACK.find((p) => p.key === "free")!
  );
}

export function invalidatePlans() {
  cache = null;
}
