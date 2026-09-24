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

/**
 * Configurable past-due grace period in days.
 * When payment fails, customers maintain access for a configurable grace window
 * (default 7 days) to resolve payment methods before downgrading to Free.
 */
export const PAST_DUE_GRACE_DAYS = Number(process.env.BILLING_PAST_DUE_GRACE_DAYS || 7);

export function isSubscriptionEntitled(sub: {
  status: string;
  currentPeriodEnd?: Date | null;
  trialEndsAt?: Date | null;
  canceledAt?: Date | null;
}): boolean {
  const now = Date.now();

  // 1. ACTIVE: entitled
  if (sub.status === "active") return true;

  // 2. TRIALING: entitled only while the trial has not expired
  if (sub.status === "trialing") {
    if (sub.trialEndsAt) {
      return sub.trialEndsAt.getTime() > now;
    }
    if (sub.currentPeriodEnd) {
      return sub.currentPeriodEnd.getTime() > now;
    }
    return true;
  }

  // 3. PAST_DUE: temporary payment failure — entitled during the grace period (7 days default)
  // after currentPeriodEnd. Once grace expires, access drops to free.
  if (sub.status === "past_due") {
    if (sub.currentPeriodEnd) {
      const graceEnd = sub.currentPeriodEnd.getTime() + PAST_DUE_GRACE_DAYS * 86_400_000;
      return now <= graceEnd;
    }
    return false;
  }

  // 4. CANCELED: user canceled renewal but prepaid for the current period — entitled until currentPeriodEnd
  if (sub.status === "canceled") {
    if (sub.currentPeriodEnd) {
      return sub.currentPeriodEnd.getTime() > now;
    }
    return false;
  }

  // 5. UNPAID, INCOMPLETE, INCOMPLETE_EXPIRED, PAUSED, etc. -> Not entitled (drops to free)
  return false;
}

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
