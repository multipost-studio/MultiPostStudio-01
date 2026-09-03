import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { PLAN_CATALOG, type PlanKey } from "@/lib/constants";

/**
 * Plans, read from the DB so admin edits in /admin/plans take effect app-wide
 * (limits, prices, feature lists). PLAN_CATALOG is the seed + the fallback when
 * the DB is unreachable (e.g. during build). Cached in-process for 30s.
 */

export type PlanRow = {
  key: PlanKey;
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  features: string[];
  sortIndex: number;
};

const FALLBACK: PlanRow[] = PLAN_CATALOG.map((p, i) => ({
  key: p.key,
  name: p.name,
  priceMonthly: p.priceMonthly,
  priceAnnual: p.priceAnnual,
  maxChannels: p.maxChannels,
  maxUsers: p.maxUsers,
  maxScheduled: p.maxScheduled,
  aiCredits: p.aiCredits,
  storageMb: p.storageMb,
  features: [...p.features],
  sortIndex: i,
}));

let cache: { at: number; value: PlanRow[] } | null = null;
const TTL_MS = 30_000;

export async function getPlans(): Promise<PlanRow[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  try {
    const rows = await db.plan.findMany({ orderBy: { sortIndex: "asc" } });
    if (rows.length === 0) return FALLBACK;
    const value: PlanRow[] = rows.map((r) => ({
      key: r.key as PlanKey,
      name: r.name,
      priceMonthly: r.priceMonthly,
      priceAnnual: r.priceAnnual,
      maxChannels: r.maxChannels,
      maxUsers: r.maxUsers,
      maxScheduled: r.maxScheduled,
      aiCredits: r.aiCredits,
      storageMb: r.storageMb,
      features: parseJson<string[]>(r.features, []),
      sortIndex: r.sortIndex,
    }));
    cache = { at: Date.now(), value };
    return value;
  } catch {
    return FALLBACK;
  }
}

export async function getPlan(key: PlanKey): Promise<PlanRow> {
  const plans = await getPlans();
  return plans.find((p) => p.key === key) ?? FALLBACK.find((p) => p.key === key)!;
}

export function invalidatePlans() {
  cache = null;
}
