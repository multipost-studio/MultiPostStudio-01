import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { PLATFORM_KEYS } from "@/lib/constants";
import type { BrandingConfig, StatSource } from "./config";

/** Real numbers from this deployment's database. A count that cannot be read is simply absent: never invented. */
export type StatCounts = Partial<Record<Exclude<StatSource, "manual">, number>>;
export type PublicStat = { id: string; label: string; value: string };

/** 1,234 -> "1.2K", 12,500 -> "12.5K", 2,300,000 -> "2.3M". Rounds down: a public counter must never overstate. */
export function formatStatValue(n: number): string {
  const v = Math.max(0, Math.floor(n));
  if (v < 1000) return String(v);
  const units: [number, string][] = [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ];
  for (const [size, suffix] of units) {
    if (v >= size) {
      const scaled = Math.floor((v / size) * 10) / 10;
      return `${Number.isInteger(scaled) ? scaled : scaled.toFixed(1)}${suffix}`;
    }
  }
  return String(v);
}

/**
 * What the public stats strip shows. Disabled stats, auto stats whose number is
 * unavailable or below the admin's minimum, and manual stats with no value are all
 * left out, and the whole strip disappears when nothing is left to show.
 */
export function resolveStats(config: BrandingConfig["stats"], counts: StatCounts): { title: string; items: PublicStat[] } | null {
  if (!config.enabled) return null;
  const items: PublicStat[] = [];
  for (const s of config.items) {
    if (!s.enabled) continue;
    if (s.source === "manual") {
      const v = s.manualValue.trim();
      if (v) items.push({ id: s.id, label: s.label, value: `${v}${s.suffix}` });
      continue;
    }
    const n = counts[s.source];
    if (typeof n !== "number" || n < s.minimum || n <= 0) continue;
    items.push({ id: s.id, label: s.label, value: `${formatStatValue(n)}${s.suffix}` });
  }
  return items.length > 0 ? { title: config.title, items } : null;
}

const TTL_MS = 10 * 60_000;
let cached: { at: number; counts: StatCounts } | null = null;

async function safe(name: string, run: () => Promise<number>): Promise<number | undefined> {
  try {
    return await run();
  } catch (err) {
    logger.warn({ err, stat: name }, "public stat count failed");
    return undefined;
  }
}

/** Live counts, cached for ten minutes so the landing page never hammers the database. */
export async function loadStatCounts(): Promise<StatCounts> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.counts;
  const [users, posts, workspaces, channels] = await Promise.all([
    safe("users", () => db.user.count({ where: { deletedAt: null, suspendedAt: null } })),
    safe("posts_published", () => db.post.count({ where: { status: "published" } })),
    safe("workspaces", () => db.workspace.count({ where: { archived: false } })),
    safe("channels", () => db.socialChannel.count()),
  ]);
  const counts: StatCounts = { platforms: PLATFORM_KEYS.length };
  if (users !== undefined) counts.users = users;
  if (posts !== undefined) counts.posts_published = posts;
  if (workspaces !== undefined) counts.workspaces = workspaces;
  if (channels !== undefined) counts.channels = channels;
  cached = { at: Date.now(), counts };
  return counts;
}
