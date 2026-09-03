import { db } from "@/lib/db";
import { getPlan, type PlanRow } from "@/lib/plans";

/**
 * Runtime capability + limit checks for an organization, derived from its
 * subscription's plan (falls back to the "free" plan when there is no active
 * subscription). Never gate a feature on a plan key directly — use this.
 *
 * Cached per-request-ish (30s in-process) keyed by orgId.
 */

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; plan: PlanRow }>();

export async function orgPlan(orgId: string): Promise<PlanRow> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.plan;

  let planKey = "free";
  try {
    const sub = await db.subscription.findUnique({
      where: { orgId },
      include: { plan: { select: { key: true } } },
    });
    // A canceled/past-nothing subscription still entitles until period end is a
    // billing concern; here we treat active + trialing + past_due as entitled.
    if (sub && ["active", "trialing", "past_due"].includes(sub.status)) {
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
    const rec = await db.usageRecord.findUnique({
      where: { orgId_metric_periodMonth: { orgId, metric, periodMonth: month } },
    });
    used = rec?.value ?? 0;
  } catch {
    /* ignore */
  }
  return { used, limit, over: limit > 0 && used > limit, pct: limit > 0 ? Math.round((used / limit) * 100) : 0 };
}

export function invalidateOrgPlan(orgId?: string) {
  if (orgId) cache.delete(orgId);
  else cache.clear();
}
