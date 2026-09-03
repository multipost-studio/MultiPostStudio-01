import { db } from "@/lib/db";

/**
 * Platform feature flags, read from the FeatureFlag table so /admin/flags
 * toggles take effect without a deploy. A flag is "on" when enabled and its
 * rollout is 100 (platform flags are all-or-nothing; rollout < 100 is treated
 * as a staged rollout and reads as off here). Cached in-process for 30s.
 */

let cache: { at: number; value: Map<string, boolean> } | null = null;
const TTL_MS = 30_000;

async function load(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const map = new Map<string, boolean>();
  try {
    const rows = await db.featureFlag.findMany();
    for (const r of rows) map.set(r.key, r.enabled && r.rollout >= 100);
  } catch {
    return map; // DB unreachable -> everything off
  }
  cache = { at: Date.now(), value: map };
  return map;
}

export async function isFeatureEnabled(key: string): Promise<boolean> {
  return (await load()).get(key) ?? false;
}

export async function featureFlags(): Promise<Record<string, boolean>> {
  return Object.fromEntries(await load());
}

export function invalidateFeatureFlags() {
  cache = null;
}
