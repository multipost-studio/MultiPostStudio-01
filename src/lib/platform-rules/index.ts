import { DEFAULT_RULES } from "./defaults";
import { buildRuleSet, type RuleSet } from "./ruleset";

export * from "./types";
export * from "./counting";
export * from "./entities";
export * from "./text";
export { accountTierFor, xTierFromSubscription } from "./tier";
export { appendHashtag, planHashtagFix, planKeepFirst, removeHashtag, type FixPlan } from "./fix";
export { proposeAdaptation, type AdaptProposal } from "./adapt";
export { buildRuleSet, effectiveKind, findRule, hasAnyRule, hasTierRules, type RuleOverride, type RuleSet } from "./ruleset";
export { DEFAULT_RULES, RULES_VERSION, VERIFIED_AT, ruleId } from "./defaults";
export { PLATFORM_LABELS, readinessOf, validateText, type ReadinessState, type TextInput, type TextValidation } from "./validate";

/** The rule set with no admin overrides — what the client uses until it is given the live one. */
export const DEFAULT_RULESET: RuleSet = buildRuleSet(DEFAULT_RULES);
