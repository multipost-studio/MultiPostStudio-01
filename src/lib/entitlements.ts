import { db } from "@/lib/db";
import { getPlan, type PlanRow } from "@/lib/plans";
import { PLAN_CATALOG } from "@/lib/constants";

/**
 * Runtime capability + limit checks for an organization, derived from its
 * subscription's plan (falls back to the "free" plan when there is no active
 * subscription). Never gate a feature on a plan key directly — use this.
 *
 * Cached per-request-ish (30s in-process) keyed by orgId.
 */

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; plan: PlanRow }>();

import { isSubscriptionEntitled, PAST_DUE_GRACE_DAYS } from "@/lib/entitlements-pure";
export { isSubscriptionEntitled, PAST_DUE_GRACE_DAYS };

export async function orgPlan(orgId: string): Promise<PlanRow> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;

  let planKey = "free";
  try {
    const sub = await db.subscription.findUnique({
      where: { orgId },
      include: { plan: { select: { key: true } } },
    });
    if (sub && isSubscriptionEntitled(sub)) {
      planKey = sub.plan.key;
    }
  } catch {
    /* DB unreachable -> free */
  }
  const plan = await getPlan(planKey);
  cache.set(orgId, { at: Date.now(), plan });
  return plan;
}

export async function orgEntitlements(orgId: string): Promise<Set<string>> {
  return new Set((await orgPlan(orgId)).entitlements);
}

export async function hasEntitlement(orgId: string, key: string): Promise<boolean> {
  return (await orgEntitlements(orgId)).has(key);
}

/** Throw-style guard for server actions. */
export async function assertEntitlement(orgId: string, key: string): Promise<void> {
  if (!(await hasEntitlement(orgId, key))) {
    throw new Error(`Your plan does not include this feature (${key}). Upgrade to unlock it.`);
  }
}

export type LimitKey =
  | "maxChannels"
  | "maxWorkspaces"
  | "maxUsers"
  | "maxScheduled"
  | "aiCredits"
  | "storageMb"
  | "apiRateLimit"
  | "automationLimit"
  | "analyticsRetentionDays";

export async function planLimit(orgId: string, key: LimitKey): Promise<number> {
  return (await orgPlan(orgId))[key];
}

export type GaugeMetric = "channels" | "users" | "scheduled_posts" | "storage_mb";
export const GAUGE_METRICS: readonly GaugeMetric[] = ["channels", "users", "scheduled_posts", "storage_mb"];

/**
 * What an org has RIGHT NOW for a metric that is a measure of current load, counted from the real
 * rows. These were read from UsageRecord, which is keyed by calendar month: on the first of every
 * month the stored gauge started again at zero while the channels, seats and files were all still
 * there, so a storage quota could be re-filled every month and the billing meters under-reported.
 * Only genuinely monthly counters (AI credits, API calls) still come from UsageRecord.
 */
export async function liveGauge(orgId: string, metric: GaugeMetric): Promise<number> {
  switch (metric) {
    case "channels":
      return db.socialChannel.count({ where: { workspace: { orgId } } });
    case "users":
      return db.membership.count({ where: { orgId } });
    case "scheduled_posts":
      return db.post.count({ where: { workspace: { orgId }, status: "scheduled" } });
    case "storage_mb": {
      const agg = await db.mediaAsset.aggregate({ _sum: { sizeBytes: true }, where: { workspace: { orgId } } });
      return Math.ceil((agg._sum.sizeBytes ?? 0) / (1024 * 1024));
    }
  }
}

/**
 * Compare current usage against the plan limit for a metric.
 * `metric` matches UsageRecord.metric values.
 */
export async function checkUsage(
  orgId: string,
  metric: "channels" | "users" | "scheduled_posts" | "ai_credits" | "storage_mb",
): Promise<{ used: number; limit: number; over: boolean; pct: number }> {
  const map: Record<typeof metric, LimitKey> = {
    channels: "maxChannels",
    users: "maxUsers",
    scheduled_posts: "maxScheduled",
    ai_credits: "aiCredits",
    storage_mb: "storageMb",
  };
  const limit = await planLimit(orgId, map[metric]);
  const month = new Date().toISOString().slice(0, 7);
  let used = 0;
  try {
    if ((GAUGE_METRICS as readonly string[]).includes(metric)) {
      used = await liveGauge(orgId, metric as GaugeMetric);
    } else {
      const rec = await db.usageRecord.findUnique({
        where: { orgId_metric_periodMonth: { orgId, metric, periodMonth: month } },
      });
      used = rec?.value ?? 0;
    }
  } catch {
    /* ignore */
  }
  return { used, limit, over: limit > 0 && used > limit, pct: limit > 0 ? Math.round((used / limit) * 100) : 0 };
}

export function invalidateOrgPlan(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}

/**
 * The cheapest public plan that includes a capability, e.g. "Pro".
 *
 * Nav items for capabilities the org's plan lacks used to be filtered out
 * entirely, so a Free workspace had no Automations or Recycling entry at all —
 * the features looked absent rather than locked, which confuses customers and
 * removes every reason to upgrade. They're shown locked now, and this names
 * the plan that unlocks them.
 *
 * Reads PLAN_CATALOG rather than the Plan table: this is a marketing label on
 * a nav tooltip, not an access decision (hasEntitlement makes those), and it
 * must not add a query to every page render.
 */
export function lowestPlanWithEntitlement(key: string): { key: string; name: string } | null {
  for (const plan of PLAN_CATALOG) {
    if (!plan.isPublic || plan.isCustom) continue;
    if (plan.entitlements.includes(key)) return { key: plan.key, name: plan.name };
  }
  return null;
}
