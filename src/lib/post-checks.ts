import { supportsFirstComment, validateChannel, type MediaInput } from "@/lib/social/capabilities";
import { DEFAULT_RULESET, type AccountTier, type PlatformMetrics, type ReadinessState, type RuleSet, type ValidationIssue } from "@/lib/platform-rules";

/**
 * The one post-level validator. The composer (live, per keystroke), schedule /
 * queue / publish-now (server), the publish pre-flight (worker) and the API all
 * call this, so they cannot disagree. Pure: no I/O, safe on the client.
 */

export type ChannelInput = {
  channelId: string;
  name: string;
  platform: string;
  contentType: string;
  body: string;
  metadata?: string | null;
  /** Resolved account tier (X Premium etc.); omit when unknown. */
  tier?: AccountTier;
};

export type ChannelCheck = {
  channelId: string;
  name: string;
  platform: string;
  contentType: string;
  /** No blocking errors. Warnings and notes never make a channel invalid. */
  valid: boolean;
  state: ReadinessState;
  errors: string[];
  warnings: string[];
  notes: string[];
  issues: ValidationIssue[];
  metrics: PlatformMetrics | null;
};

export type PostCheck = {
  /** Every channel is valid. */
  valid: boolean;
  channels: ChannelCheck[];
  validCount: number;
  invalidCount: number;
};

export function checkChannels(args: {
  channels: readonly ChannelInput[];
  media: readonly MediaInput[];
  firstComment?: string | null;
  rules?: RuleSet;
}): PostCheck {
  const rules = args.rules ?? DEFAULT_RULESET;
  const channels = args.channels.map((c): ChannelCheck => {
    const r = validateChannel(
      c.platform,
      c.contentType,
      { body: c.body, media: [...args.media], metadata: c.metadata ?? undefined },
      {
        rules,
        // A first comment only exists on platforms that publish one.
        firstComment: supportsFirstComment(c.platform) ? args.firstComment : null,
        context: { tier: c.tier },
      },
    );
    return {
      channelId: c.channelId,
      name: c.name,
      platform: c.platform,
      contentType: c.contentType,
      valid: r.errors.length === 0,
      state: r.errors.length ? "error" : r.warnings.length ? "warning" : "ok",
      errors: r.errors,
      warnings: r.warnings,
      notes: r.notes,
      issues: r.issues,
      metrics: r.metrics,
    };
  });
  const validCount = channels.filter((c) => c.valid).length;
  return { valid: validCount === channels.length, channels, validCount, invalidCount: channels.length - validCount };
}

/** "Name: problem" lines, the shape server actions return to the UI. */
export function problemLines(check: PostCheck): string[] {
  return check.channels.flatMap((c) => c.errors.map((e) => `${c.name}: ${e}`));
}

/**
 * Prefix on errors raised by the pre-flight check. They are permanent (the
 * content must change), so isRetryablePublishError never retries them — their
 * text contains numbers like "501" that would otherwise look like HTTP 5xx.
 */
export const PREFLIGHT_PREFIX = "Not sent — ";
