import type { PlatformKey } from "@/lib/constants";
import type { CountMethod } from "./counting";

/**
 * How binding a rule is. Only the first three can block publishing; a
 * RECOMMENDATION is advice and never does.
 *   HARD_LIMIT      the platform itself enforces it
 *   API_LIMIT       the publishing API we call enforces it
 *   ACCOUNT_LIMIT   depends on the connected account (e.g. X Premium)
 *   RECOMMENDATION  best practice, not a platform rule
 */
export type RuleKind = "HARD_LIMIT" | "API_LIMIT" | "ACCOUNT_LIMIT" | "RECOMMENDATION";

export const BLOCKING_KINDS: readonly RuleKind[] = ["HARD_LIMIT", "API_LIMIT", "ACCOUNT_LIMIT"];

/** What a rule constrains. */
export type RuleKey =
  /** primary body text: caption / post / commentary / message */
  | "text.max"
  | "title.max"
  | "description.max"
  | "hashtags.max"
  | "hashtags.recommendedMax"
  /** YouTube: above this many hashtags the platform may ignore them all */
  | "hashtags.ignoredAbove"
  /** Threads topic tags (a distinct concept from hashtags) */
  | "topicTags.max"
  | "mentions.max"
  | "links.max";

export const RULE_KEYS: readonly RuleKey[] = [
  "text.max",
  "title.max",
  "description.max",
  "hashtags.max",
  "hashtags.recommendedMax",
  "hashtags.ignoredAbove",
  "topicTags.max",
  "mentions.max",
  "links.max",
];

/** Connected-account tier where it changes the rules. "unknown" = not verifiable. */
export type AccountTier = "standard" | "premium" | "unknown";

export type RuleSource = { name: string; url: string };

/**
 * `needs_verification` rules are shown in the admin list with a flag and are
 * never allowed to block: they are evaluated as recommendations until someone
 * confirms them against official documentation.
 */
export type Verification = "verified" | "needs_verification";

export type PlatformRule = {
  /** Stable id: `${platform}.${key}` plus `:${tier}` and/or `@${contentTypes}` when scoped. */
  id: string;
  platform: PlatformKey;
  key: RuleKey;
  value: number;
  kind: RuleKind;
  /** How text is measured for text/title/description rules. */
  countMethod?: CountMethod;
  /** Restrict to these content types; omitted = every type on the platform. */
  contentTypes?: string[];
  /** Restrict to a connected-account tier. */
  tier?: AccountTier;
  /** Human text for the admin list, e.g. "Hashtags per post". */
  label: string;
  source: RuleSource;
  /** Rule-set version label, e.g. "2026-10". */
  version: string;
  /** ISO date this was last checked against the source. */
  lastVerifiedAt: string;
  enabled: boolean;
  verification: Verification;
  note?: string;
};

export type Severity = "error" | "warning" | "info";

export type IssueFix =
  /** Remove these hashtags (spans in the validated text). */
  | { type: "remove_hashtags"; spans: { start: number; end: number; text: string; in?: "text" | "firstComment" }[] }
  | { type: "shorten"; over: number }
  | { type: "none" };

export type ValidationIssue = {
  platform: string;
  /** Machine code, e.g. "hashtags.max". */
  code: string;
  severity: Severity;
  kind: RuleKind | "SYSTEM";
  message: string;
  /** Which input the issue is about, so the UI can focus it. */
  field: "text" | "title" | "description" | "firstComment" | "media" | "general";
  fix?: IssueFix;
};

/** Numbers behind a counter chip: "1,842 / 2,200 characters", "4 / 5 hashtags". */
export type PlatformMetrics = {
  text: { count: number; limit: number | null; unit: string; method: CountMethod } | null;
  title: { count: number; limit: number | null; unit: string } | null;
  description: { count: number; limit: number | null; unit: string } | null;
  hashtags: { count: number; limit: number | null; recommended: number | null } | null;
  topicTags: { count: number; limit: number | null } | null;
  mentions: { count: number; limit: number | null } | null;
  links: { count: number; limit: number | null } | null;
};

export type ChannelContext = {
  tier?: AccountTier;
};
