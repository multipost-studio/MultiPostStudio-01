import type { AccountTier, PlatformRule, RuleKey, RuleKind, RuleSource, Verification } from "./types";

/**
 * An admin edit layered over a code default. Only what the admin may change is
 * representable here, so an override can never invent a rule or change what it
 * measures.
 */
export type RuleOverride = {
  id: string;
  value?: number;
  enabled?: boolean;
  kind?: RuleKind;
  source?: RuleSource;
  version?: string;
  lastVerifiedAt?: string;
  verification?: Verification;
};

export type RuleSet = {
  rules: readonly PlatformRule[];
};

export function buildRuleSet(defaults: readonly PlatformRule[], overrides: readonly RuleOverride[] = []): RuleSet {
  const byId = new Map(overrides.map((o) => [o.id, o]));
  const rules = defaults.map((d): PlatformRule => {
    const o = byId.get(d.id);
    if (!o) return d;
    return {
      ...d,
      value: typeof o.value === "number" && Number.isFinite(o.value) && o.value >= 0 ? o.value : d.value,
      enabled: o.enabled ?? d.enabled,
      kind: o.kind ?? d.kind,
      source: o.source ?? d.source,
      version: o.version ?? d.version,
      lastVerifiedAt: o.lastVerifiedAt ?? d.lastVerifiedAt,
      verification: o.verification ?? d.verification,
    };
  });
  return { rules };
}

/** Unverified rules are advice, whatever kind they were filed under. */
export function effectiveKind(rule: PlatformRule): RuleKind {
  return rule.verification === "needs_verification" ? "RECOMMENDATION" : rule.kind;
}

/**
 * The most specific enabled rule for (platform, key) in this context.
 * Specificity: matching content type beats "any type"; matching tier beats
 * "any tier". An unknown tier falls back to the `standard` rule (the safest
 * limit) rather than to nothing.
 */
export function findRule(
  set: RuleSet,
  platform: string,
  key: RuleKey,
  ctx: { contentType?: string; tier?: AccountTier } = {},
): PlatformRule | null {
  const tier: AccountTier = ctx.tier ?? "unknown";
  let best: PlatformRule | null = null;
  let bestScore = -1;
  for (const r of set.rules) {
    if (!r.enabled || r.platform !== platform || r.key !== key) continue;
    let score = 0;
    if (r.contentTypes) {
      if (!ctx.contentType || !r.contentTypes.includes(ctx.contentType)) continue;
      score += 2;
    }
    if (r.tier) {
      const wanted = tier === "unknown" ? "standard" : tier;
      if (r.tier !== wanted) continue;
      score += 1;
    }
    if (score > bestScore) {
      best = r;
      bestScore = score;
    }
  }
  return best;
}

/** True when the platform has tier-dependent rules (so an unknown tier is worth telling the user about). */
export function hasTierRules(set: RuleSet, platform: string): boolean {
  return set.rules.some((r) => r.enabled && r.platform === platform && r.tier);
}

/** True if any rule (enabled or not) exists for this platform/key/content type. A disabled rule means "don't check", so it must not fall back to the legacy limit. */
export function hasAnyRule(set: RuleSet, platform: string, key: RuleKey, contentType?: string): boolean {
  return set.rules.some((r) => r.platform === platform && r.key === key && (!r.contentTypes || (contentType != null && r.contentTypes.includes(contentType))));
}
