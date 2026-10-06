import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { buildRuleSet, DEFAULT_RULES, DEFAULT_RULESET, type RuleOverride, type RuleSet } from "@/lib/platform-rules";

/**
 * Server-side loader for the live rule set: code defaults + admin overrides.
 *
 * Fails safe: if the table is missing (migration not applied yet) or the query
 * errors, it returns the built-in defaults, so publishing keeps working with the
 * documented limits instead of breaking.
 */

const TTL_MS = 30_000;
let cache: { at: number; set: RuleSet; overrides: RuleOverride[] } | null = null;

export function invalidatePlatformRules(): void {
  cache = null;
}

type Row = {
  id: string;
  value: number | null;
  enabled: boolean | null;
  kind: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  version: string | null;
  verification: string | null;
  lastVerifiedAt: Date | null;
};

const KINDS = ["HARD_LIMIT", "API_LIMIT", "ACCOUNT_LIMIT", "RECOMMENDATION"] as const;

export function rowToOverride(r: Row): RuleOverride {
  const o: RuleOverride = { id: r.id };
  if (r.value != null) o.value = r.value;
  if (r.enabled != null) o.enabled = r.enabled;
  if (r.kind && (KINDS as readonly string[]).includes(r.kind)) o.kind = r.kind as RuleOverride["kind"];
  if (r.sourceName) o.source = { name: r.sourceName, url: r.sourceUrl ?? "" };
  if (r.version) o.version = r.version;
  if (r.verification === "verified" || r.verification === "needs_verification") o.verification = r.verification;
  if (r.lastVerifiedAt) o.lastVerifiedAt = r.lastVerifiedAt.toISOString().slice(0, 10);
  return o;
}

/** Only ids that exist in the defaults can be overridden. */
const KNOWN_IDS = new Set(DEFAULT_RULES.map((r) => r.id));

export async function getPlatformRuleOverrides(): Promise<RuleOverride[]> {
  await getRuleSet();
  return cache?.overrides ?? [];
}

export async function getRuleSet(): Promise<RuleSet> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.set;
  try {
    const rows = await db.platformRule.findMany();
    const overrides = rows.filter((r) => KNOWN_IDS.has(r.id)).map(rowToOverride);
    const set = buildRuleSet(DEFAULT_RULES, overrides);
    cache = { at: Date.now(), set, overrides };
    return set;
  } catch (err) {
    logger.warn({ err }, "platform rules: could not load overrides, using built-in defaults");
    return DEFAULT_RULESET;
  }
}
