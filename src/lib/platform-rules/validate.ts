import { COUNT_UNIT_LABEL, countBy, type CountMethod } from "./counting";
import { findHashtags, findMentions, findUrls, uniqueHashtags, type Hashtag } from "./entities";
import { effectiveKind, findRule, hasAnyRule, hasTierRules, type RuleSet } from "./ruleset";
import { firstLine, splitThread, TITLE_FROM_FIRST_LINE } from "./text";
import { BLOCKING_KINDS, type ChannelContext, type PlatformMetrics, type PlatformRule, type ValidationIssue } from "./types";

export const PLATFORM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  x: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  pinterest: "Pinterest",
  threads: "Threads",
  gbp: "Google Business",
  bluesky: "Bluesky",
};

export type TextInput = {
  platform: string;
  contentType: string;
  body: string;
  firstComment?: string | null;
  /** Fallback caption limit (from the capability table) used when no rule is registered. */
  fallbackLimit?: number;
  context?: ChannelContext;
};

export type TextValidation = { issues: ValidationIssue[]; metrics: PlatformMetrics };

const n = (v: number) => v.toLocaleString("en-US");
const plural = (count: number, word: string) => `${n(count)} ${word}${count === 1 ? "" : "s"}`;

function severityFor(rule: PlatformRule): "error" | "warning" {
  return BLOCKING_KINDS.includes(effectiveKind(rule)) ? "error" : "warning";
}

function label(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

/** The counted text for the description/body rule. YouTube Shorts get #Shorts appended at publish time. */
function publishedBody(input: TextInput): string {
  return input.platform === "youtube" && input.contentType === "short" ? `${input.body}\n#Shorts` : input.body;
}

/**
 * Text-level validation for one channel: length (by the platform's own counting
 * method), title/description, hashtags, topic tags, mentions and links. Pure
 * and synchronous, so the composer can run it on every keystroke and the server
 * can run the very same function before publishing.
 */
export function validateText(rules: RuleSet, input: TextInput): TextValidation {
  const { platform, contentType, body } = input;
  const issues: ValidationIssue[] = [];
  const name = label(platform);
  const ctx = { contentType, tier: input.context?.tier };
  const metrics: PlatformMetrics = { text: null, title: null, description: null, hashtags: null, topicTags: null, mentions: null, links: null };

  // ---- length ----------------------------------------------------------
  const textRule = findRule(rules, platform, "text.max", ctx);
  const descRule = findRule(rules, platform, "description.max", ctx);
  const titleRule = findRule(rules, platform, "title.max", ctx);
  const bodyRule = descRule ?? textRule;
  const ruled = hasAnyRule(rules, platform, "text.max", contentType) || hasAnyRule(rules, platform, "description.max", contentType);
  const useFallback = !ruled && input.fallbackLimit != null;

  if (bodyRule || useFallback) {
    const method: CountMethod = bodyRule?.countMethod ?? "characters";
    const unit = COUNT_UNIT_LABEL[method];
    const limit = bodyRule?.value ?? (useFallback ? input.fallbackLimit! : null);
    const parts = contentType === "thread" ? splitThread(body) : [publishedBody(input)];
    const counts = parts.map((p) => countBy(method, p));
    const worst = Math.max(0, ...counts);
    const measured = descRule ? { count: worst, limit, unit } : null;
    if (descRule) metrics.description = measured;
    else metrics.text = { count: worst, limit, unit, method };

    if (limit != null) {
      counts.forEach((count, i) => {
        if (count <= limit) return;
        const over = count - limit;
        const where = contentType === "thread" ? `Thread post ${i + 1} is ${n(count)}/${n(limit)} ${unit}. ` : "";
        const severity = bodyRule ? severityFor(bodyRule) : "error";
        const field = descRule ? "description" : "text";
        issues.push({
          platform,
          code: descRule ? "description.max" : "text.max",
          severity,
          kind: bodyRule ? effectiveKind(bodyRule) : "API_LIMIT",
          field,
          message:
            contentType === "thread"
              ? `${where}${name} allows ${n(limit)} ${unit} per post.`
              : textLimitMessage(platform, name, bodyRule, limit, count, unit, descRule != null) + ` Shorten it by ${n(over)} ${unit}.`,
          fix: { type: "shorten", over },
        });
      });
    }
  }

  if (titleRule && TITLE_FROM_FIRST_LINE.includes(platform)) {
    const method = titleRule.countMethod ?? "characters";
    const unit = COUNT_UNIT_LABEL[method];
    const title = firstLine(body);
    const count = countBy(method, title);
    metrics.title = { count, limit: titleRule.value, unit };
    if (count > titleRule.value) {
      issues.push({
        platform,
        code: "title.max",
        severity: severityFor(titleRule),
        kind: effectiveKind(titleRule),
        field: "title",
        message: `${name} titles can be ${n(titleRule.value)} ${unit}. Your first line (used as the title) is ${n(count)}. Shorten it by ${n(count - titleRule.value)}.`,
        fix: { type: "shorten", over: count - titleRule.value },
      });
    }
  }

  // ---- tier note ---------------------------------------------------------
  if (hasTierRules(rules, platform) && (input.context?.tier ?? "unknown") === "unknown") {
    issues.push({
      platform,
      code: "tier.unknown",
      severity: "info",
      kind: "SYSTEM",
      field: "general",
      message: `${name} account type could not be verified. The standard limit is being used.`,
    });
  }

  // ---- hashtags / topic tags --------------------------------------------
  const inBody = findHashtags(body);
  const inComment = input.firstComment ? findHashtags(input.firstComment) : [];
  const topicRule = findRule(rules, platform, "topicTags.max", ctx);

  if (topicRule) {
    const tags = uniqueHashtags(body);
    metrics.topicTags = { count: tags.length, limit: topicRule.value };
    if (tags.length > topicRule.value) {
      const extra = tags.slice(topicRule.value);
      issues.push({
        platform,
        code: "topicTags.max",
        severity: severityFor(topicRule),
        kind: effectiveKind(topicRule),
        field: "text",
        message: `${name} allows only ${plural(topicRule.value, "topic tag")} per post. You have ${tags.length} (${tags.map((t) => t.text).join(", ")}). Remove ${plural(extra.length, "tag")}.`,
        fix: { type: "remove_hashtags", spans: extra.map(spanOf) },
      });
    }
  }

  const maxRule = findRule(rules, platform, "hashtags.max", ctx);
  const recRule = findRule(rules, platform, "hashtags.recommendedMax", ctx);
  const ignoredRule = findRule(rules, platform, "hashtags.ignoredAbove", ctx);
  if (maxRule || recRule || ignoredRule) {
    // Moving tags to the first comment must not be a way around a limit, so
    // both places count, once per distinct tag.
    const distinct = distinctAcross(inBody, inComment);
    const count = distinct.length;
    metrics.hashtags = { count, limit: maxRule?.value ?? null, recommended: recRule?.value ?? null };
    const where = inComment.length ? " (caption and first comment)" : "";

    if (maxRule && count > maxRule.value) {
      const over = count - maxRule.value;
      const removable = tailSpans(inBody, inComment, over);
      issues.push({
        platform,
        code: "hashtags.max",
        severity: severityFor(maxRule),
        kind: effectiveKind(maxRule),
        field: removable.some((s) => s.in === "firstComment") && !removable.some((s) => s.in === "text") ? "firstComment" : "text",
        message: `${name} allows up to ${plural(maxRule.value, "hashtag")}. You currently have ${n(count)}${where}. Remove ${plural(over, "hashtag")} before publishing.`,
        fix: { type: "remove_hashtags", spans: removable },
      });
    } else if (recRule && count > recRule.value && !(maxRule && count > maxRule.value)) {
      issues.push({
        platform,
        code: "hashtags.recommendedMax",
        severity: "warning",
        kind: "RECOMMENDATION",
        field: "text",
        message: `Recommended: use ${recRule.note ?? `up to ${recRule.value}`} highly relevant hashtags on ${name}. You have ${n(count)}. This is advice, not a ${name} limit.`,
      });
    }

    if (ignoredRule && count > ignoredRule.value) {
      issues.push({
        platform,
        code: "hashtags.ignoredAbove",
        severity: severityFor(ignoredRule),
        kind: effectiveKind(ignoredRule),
        field: "text",
        message: `${name} may ignore every hashtag on a video that has more than ${n(ignoredRule.value)}. You have ${n(count)}. Remove ${plural(count - ignoredRule.value, "hashtag")}.`,
        fix: { type: "remove_hashtags", spans: tailSpans(inBody, inComment, count - ignoredRule.value) },
      });
    }
  }

  // ---- mentions / links ---------------------------------------------------
  const mentionRule = findRule(rules, platform, "mentions.max", ctx);
  if (mentionRule) {
    const count = findMentions(body).length;
    metrics.mentions = { count, limit: mentionRule.value };
    if (count > mentionRule.value) {
      issues.push({
        platform,
        code: "mentions.max",
        severity: severityFor(mentionRule),
        kind: effectiveKind(mentionRule),
        field: "text",
        message: `${name} allows up to ${plural(mentionRule.value, "mention")}. You have ${n(count)}.`,
      });
    }
  }
  const linkRule = findRule(rules, platform, "links.max", ctx);
  if (linkRule) {
    const count = findUrls(body).length;
    metrics.links = { count, limit: linkRule.value };
    if (count > linkRule.value) {
      issues.push({
        platform,
        code: "links.max",
        severity: severityFor(linkRule),
        kind: effectiveKind(linkRule),
        field: "text",
        message: `${name} allows ${plural(linkRule.value, "link")} per post. You have ${n(count)}.`,
      });
    }
  }

  return { issues, metrics };
}

function textLimitMessage(platform: string, name: string, rule: PlatformRule | null, limit: number, count: number, unit: string, isDescription: boolean): string {
  if (platform === "x" && rule?.tier) {
    return `This X account supports ${n(limit)} ${unit}. Your post contains ${n(count)} ${unit}.`;
  }
  const what = isDescription ? `${name} descriptions allow` : `${name} allows`;
  return `${what} ${n(limit)} ${unit}. Your post contains ${n(count)}.`;
}

type Span = { start: number; end: number; text: string; in: "text" | "firstComment" };

function spanOf(h: Hashtag): { start: number; end: number; text: string } {
  return { start: h.start, end: h.end, text: h.text };
}

/** Distinct hashtags across caption and first comment, case-insensitive, caption first. */
function distinctAcross(body: Hashtag[], comment: Hashtag[]): Hashtag[] {
  const seen = new Set<string>();
  return [...body, ...comment].filter((h) => {
    const k = h.tag.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * The last `count` distinct hashtags (by first appearance), with every
 * occurrence of each, so a fix removes exactly what the user was shown.
 * First-comment tags go first: they are the cheapest to lose.
 */
function tailSpans(body: Hashtag[], comment: Hashtag[], count: number): Span[] {
  const distinct = distinctAcross(body, comment);
  const doomed = new Set(distinct.slice(distinct.length - count).map((h) => h.tag.toLowerCase()));
  return [
    ...body.filter((h) => doomed.has(h.tag.toLowerCase())).map((h) => ({ ...spanOf(h), in: "text" as const })),
    ...comment.filter((h) => doomed.has(h.tag.toLowerCase())).map((h) => ({ ...spanOf(h), in: "firstComment" as const })),
  ];
}

export type ReadinessState = "ok" | "warning" | "error";

export function readinessOf(issues: readonly ValidationIssue[]): ReadinessState {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.some((i) => i.severity === "warning")) return "warning";
  return "ok";
}
