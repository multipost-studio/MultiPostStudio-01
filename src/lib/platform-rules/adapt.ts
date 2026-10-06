import { findHashtags } from "./entities";
import { planKeepFirst } from "./fix";
import { findRule, type RuleSet } from "./ruleset";
import { validateText } from "./validate";
import type { AccountTier } from "./types";

export type AdaptProposal = {
  platform: string;
  /** The channel's text before adaptation. */
  before: string;
  /** What we propose to put there. Never applied without confirmation. */
  after: string;
  /** Human-readable list of every change made on top of the adapted text. */
  changes: string[];
  removedTags: string[];
  /** Blocking problems the proposal still has (e.g. over the length limit). */
  remainingErrors: string[];
  length: { before: number; after: number; limit: number | null; unit: string } | null;
};

/**
 * Turn an adapted draft into a reviewable proposal for one platform.
 *
 * The only automatic edit is trimming surplus hashtags down to the platform's
 * hard limit — and that is listed in `changes` so the user sees it. Length is
 * never auto-truncated: if the text is still too long, it is reported in
 * `remainingErrors` so the user shortens it deliberately.
 */
export function proposeAdaptation(
  rules: RuleSet,
  args: { platform: string; contentType: string; before: string; adapted: string; tier?: AccountTier },
): AdaptProposal {
  const ctx = { contentType: args.contentType, tier: args.tier };
  let after = args.adapted;
  const changes: string[] = [];
  let removedTags: string[] = [];

  const cap = findRule(rules, args.platform, "hashtags.max", ctx);
  if (cap && findHashtags(after).length > 0) {
    const plan = planKeepFirst({ body: after, firstComment: "" }, cap.value);
    if (plan) {
      after = plan.body;
      removedTags = plan.removed;
      changes.push(`Removed ${plan.removed.length} hashtag${plan.removed.length === 1 ? "" : "s"} over the ${cap.value}-hashtag limit: ${plan.removed.join(" ")}`);
    }
  }

  const input = { platform: args.platform, contentType: args.contentType, context: { tier: args.tier } };
  const beforeV = validateText(rules, { ...input, body: args.before });
  const afterV = validateText(rules, { ...input, body: after });
  const b = beforeV.metrics.text ?? beforeV.metrics.description;
  const a = afterV.metrics.text ?? afterV.metrics.description;
  const length = a && b ? { before: b.count, after: a.count, limit: a.limit, unit: a.unit } : null;
  if (length && length.before !== length.after) {
    changes.push(`Length: ${length.before.toLocaleString("en-US")} → ${length.after.toLocaleString("en-US")} ${length.unit}`);
  }

  return {
    platform: args.platform,
    before: args.before,
    after,
    changes,
    removedTags,
    remainingErrors: afterV.issues.filter((i) => i.severity === "error").map((i) => i.message),
    length,
  };
}
