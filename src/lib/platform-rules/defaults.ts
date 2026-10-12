import type { PlatformKey } from "@/lib/constants";
import type { CountMethod } from "./counting";
import type { AccountTier, PlatformRule, RuleKey, RuleKind, RuleSource, Verification } from "./types";

/**
 * Baseline platform rules. This file is the single place limits are written
 * down; the composer, the validators, the publisher pre-flight, previews and the
 * admin page all read the rule set built from it (plus admin overrides).
 *
 * Honesty rules for adding a rule:
 *  - Cite the official page in `source`. Do not cite blog posts.
 *  - File a rule as HARD_LIMIT / API_LIMIT / ACCOUNT_LIMIT only if the platform
 *    or its API enforces it. Best practice is RECOMMENDATION.
 *  - If you could not confirm it, mark `needs_verification`. Such a rule is
 *    evaluated as a recommendation and can never block publishing.
 */

export const RULES_VERSION = "2026-10";
export const VERIFIED_AT = "2026-10-06";

type Spec = {
  platform: PlatformKey;
  key: RuleKey;
  value: number;
  kind: RuleKind;
  label: string;
  source: RuleSource;
  countMethod?: CountMethod;
  contentTypes?: string[];
  tier?: AccountTier;
  verification?: Verification;
  note?: string;
};

export function ruleId(s: Pick<Spec, "platform" | "key" | "tier" | "contentTypes">): string {
  return `${s.platform}.${s.key}${s.tier ? `:${s.tier}` : ""}${s.contentTypes ? `@${s.contentTypes.join("+")}` : ""}`;
}

function r(s: Spec): PlatformRule {
  return {
    id: ruleId(s),
    platform: s.platform,
    key: s.key,
    value: s.value,
    kind: s.kind,
    countMethod: s.countMethod,
    contentTypes: s.contentTypes,
    tier: s.tier,
    label: s.label,
    source: s.source,
    version: RULES_VERSION,
    lastVerifiedAt: VERIFIED_AT,
    enabled: true,
    verification: s.verification ?? "verified",
    note: s.note,
  };
}

const IG_HELP: RuleSource = { name: "Instagram Help Center", url: "https://help.instagram.com/351460621611097" };
const IG_API: RuleSource = {
  name: "Instagram Graph API · IG User Media",
  url: "https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media",
};
const THREADS_API: RuleSource = { name: "Threads API · Posts", url: "https://developers.facebook.com/documentation/threads/posts" };
const X_COUNT: RuleSource = { name: "X Developer docs · Counting characters", url: "https://docs.x.com/fundamentals/counting-characters" };
const X_PREMIUM: RuleSource = { name: "X Help Center · X Premium", url: "https://help.x.com/en/using-x/x-premium" };
const BSKY_LEXICON: RuleSource = {
  name: "AT Protocol · app.bsky.feed.post lexicon",
  url: "https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/post.json",
};
const TIKTOK_API: RuleSource = {
  name: "TikTok Content Posting API · Direct Post",
  url: "https://developers.tiktok.com/doc/content-posting-api-reference-direct-post",
};
const YT_VIDEOS: RuleSource = { name: "YouTube Data API · videos resource", url: "https://developers.google.com/youtube/v3/docs/videos" };
const YT_HASHTAGS: RuleSource = { name: "YouTube Help · Add hashtags", url: "https://support.google.com/youtube/answer/6390658" };
const LINKEDIN_HELP: RuleSource = { name: "LinkedIn Help · Post limits", url: "https://www.linkedin.com/help/linkedin/answer/a528176/" };
const PINTEREST_API: RuleSource = { name: "Pinterest API v5 · OpenAPI (PinCreate)", url: "https://github.com/pinterest/api-description" };
const UNVERIFIED_SOURCE: RuleSource = {
  name: "Carried over from the previous capability table; not re-verified against official docs",
  url: "",
};

export const DEFAULT_RULES: readonly PlatformRule[] = [
  /* ---------------- Instagram ---------------- */
  r({
    platform: "instagram",
    key: "text.max",
    value: 2200,
    kind: "API_LIMIT",
    label: "Caption length",
    countMethod: "characters",
    contentTypes: ["post", "carousel", "reel", "story"],
    source: IG_API,
  }),
  r({
    platform: "instagram",
    key: "hashtags.max",
    value: 5,
    kind: "HARD_LIMIT",
    label: "Hashtags per post",
    source: IG_HELP,
    note: "Instagram's Help Center states a 5-tag limit. The Graph API reference still lists 30, and no official source says the API rejects more than 5 — so this is enforced as the in-app rule.",
  }),
  r({ platform: "instagram", key: "mentions.max", value: 20, kind: "API_LIMIT", label: "@ mentions in caption", source: IG_API }),

  /* ---------------- Threads ---------------- */
  r({
    platform: "threads",
    key: "text.max",
    value: 500,
    kind: "API_LIMIT",
    label: "Post length",
    countMethod: "threads",
    contentTypes: ["post"],
    source: THREADS_API,
    note: "Emoji count as their UTF-8 byte length.",
  }),
  r({
    platform: "threads",
    key: "topicTags.max",
    value: 1,
    kind: "HARD_LIMIT",
    label: "Topic tags per post",
    source: THREADS_API,
    note: "Threads uses one topic tag per post (the first valid #tag). This is separate from ordinary hashtags.",
  }),
  r({ platform: "threads", key: "links.max", value: 5, kind: "API_LIMIT", label: "Unique links per post", source: THREADS_API }),

  /* ---------------- X ---------------- */
  r({
    platform: "x",
    key: "text.max",
    value: 280,
    kind: "ACCOUNT_LIMIT",
    label: "Post length · standard account",
    countMethod: "x_weighted",
    contentTypes: ["post", "thread"],
    tier: "standard",
    source: X_COUNT,
  }),
  r({
    platform: "x",
    key: "text.max",
    value: 25000,
    kind: "ACCOUNT_LIMIT",
    label: "Post length · subscriber account",
    countMethod: "x_weighted",
    contentTypes: ["post", "thread"],
    tier: "premium",
    source: X_PREMIUM,
    note: "X's Help Center lists 25,000 characters for subscribers. X's API docs don't say whether the posting API accepts long posts, so X may still reject one — we show its message if so.",
  }),

  /* ---------------- Bluesky ---------------- */
  r({
    platform: "bluesky",
    key: "text.max",
    value: 300,
    kind: "HARD_LIMIT",
    label: "Post length",
    countMethod: "graphemes",
    contentTypes: ["post"],
    source: BSKY_LEXICON,
  }),

  /* ---------------- TikTok ---------------- */
  r({
    platform: "tiktok",
    key: "text.max",
    value: 2200,
    kind: "API_LIMIT",
    label: "Video caption (UTF-16 runes)",
    countMethod: "utf16",
    contentTypes: ["video"],
    source: TIKTOK_API,
    note: "Hashtags and mentions are part of the caption.",
  }),

  /* ---------------- YouTube ---------------- */
  r({
    platform: "youtube",
    key: "title.max",
    value: 100,
    kind: "API_LIMIT",
    label: "Video title",
    countMethod: "characters",
    contentTypes: ["video", "short"],
    source: YT_VIDEOS,
  }),
  r({
    platform: "youtube",
    key: "description.max",
    value: 5000,
    kind: "API_LIMIT",
    label: "Video description (bytes)",
    countMethod: "bytes",
    contentTypes: ["video", "short"],
    source: YT_VIDEOS,
    note: "The API limit is 5000 bytes, not characters. Non-English text and emoji use more than one byte each.",
  }),
  r({
    platform: "youtube",
    key: "hashtags.ignoredAbove",
    value: 60,
    kind: "HARD_LIMIT",
    label: "Hashtags before YouTube ignores them all",
    source: YT_HASHTAGS,
    note: "Hashtags (#) are different from video tags/keywords. Over 60 hashtags, YouTube ignores every hashtag on the video.",
  }),

  /* ---------------- LinkedIn ---------------- */
  r({
    platform: "linkedin",
    key: "text.max",
    value: 3000,
    kind: "HARD_LIMIT",
    label: "Post length",
    countMethod: "characters",
    contentTypes: ["post", "image", "video"],
    source: LINKEDIN_HELP,
    note: "Documented in LinkedIn's Help Center; the Posts API reference doesn't state a number.",
  }),
  r({
    platform: "linkedin",
    key: "hashtags.recommendedMax",
    value: 5,
    kind: "RECOMMENDATION",
    label: "Hashtags (best practice)",
    source: { name: "Industry best practice — not a LinkedIn rule", url: "" },
    note: "3–5",
  }),

  /* ---------------- Pinterest ---------------- */
  r({
    platform: "pinterest",
    key: "title.max",
    value: 100,
    kind: "API_LIMIT",
    label: "Pin title",
    countMethod: "characters",
    contentTypes: ["pin", "carousel_pin", "video_pin"],
    source: PINTEREST_API,
  }),
  r({
    platform: "pinterest",
    key: "description.max",
    value: 800,
    kind: "API_LIMIT",
    label: "Pin description",
    countMethod: "characters",
    contentTypes: ["pin", "carousel_pin", "video_pin"],
    source: PINTEREST_API,
  }),

  /* ---------------- Facebook / Google Business (not independently verified) ---------------- */
  r({
    platform: "facebook",
    key: "text.max",
    value: 63206,
    kind: "API_LIMIT",
    label: "Post length",
    countMethod: "characters",
    contentTypes: ["post", "photo", "video", "reel", "story"],
    source: UNVERIFIED_SOURCE,
    verification: "needs_verification",
  }),
  r({
    platform: "gbp",
    key: "text.max",
    value: 1500,
    kind: "API_LIMIT",
    label: "Post summary length",
    countMethod: "characters",
    contentTypes: ["post", "event", "offer"],
    source: UNVERIFIED_SOURCE,
    verification: "needs_verification",
  }),
];
