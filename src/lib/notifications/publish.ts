import { joinPlatforms, platformName } from "./types";

/**
 * Plain-language publish-failure notifications. The queue already stores a customer-safe sentence per
 * channel (friendlyPublishError); this turns a post's channel results into ONE notification: what happened,
 * why in a sentence, and the actions that fix it. Raw provider errors, stack traces and tokens never come
 * through here: only the already-sanitised channel `error` text does, and it is capped.
 */

export type ChannelOutcome = { platform: string; status: "published" | "failed" | string; error?: string | null };

export type FailureKind = "reconnect" | "content" | "retry";

/** Whether the fix is reconnecting the account, editing the content, or simply trying again. */
export function classifyFailure(error: string | null | undefined): FailureKind {
  const e = (error ?? "").toLowerCase();
  // Transient problems first: "rate limited" contains "limit" and must not be mistaken for a content limit.
  if (/rate.?limit|too many requests|try again|temporar|timed? ?out|unavailable|overloaded|5dd/.test(e)) return "retry";
  if (/reconnect|expired|revoked|isn.t connected|not connected|permission|authori[sz]|sign in again|token/.test(e)) return "reconnect";
  if (/too long|character|limit|aspect|ratio|duration|format|size|not supported|isn.t allowed|invalid|rejected|media|image|video|caption/.test(e)) return "content";
  return "retry";
}

/** A short, safe reason for the body text. Falls back to a generic line when there is nothing usable. */
export function friendlyReason(error: string | null | undefined): string {
  const t = (error ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "The platform did not accept it.";
  // Anything that looks like a dump (JSON, a stack frame, a URL with a query) is not a reason.
  if (/[{}]|\bat\s+\S+\s*\(|https?:\/\/\S+\?|\bstack\b|\bECONN|\bETIMEDOUT/i.test(t)) return "The platform could not be reached or did not accept it.";
  return t.length > 160 ? `${t.slice(0, 157)}...` : t;
}

export type PublishNotification = {
  type: "publish_success" | "publish_failed" | "publish_partial";
  title: string;
  body: string;
  priority: "normal" | "high";
  actionLabel: string;
  linkUrl: string;
  platform: string | null;
  metadata: Record<string, unknown>;
};

export function buildPublishNotification(args: {
  postId: string;
  postTitle: string | null | undefined;
  channels: ChannelOutcome[];
}): PublishNotification {
  const name = args.postTitle?.trim() || "Untitled post";
  const quoted = `"${name.length > 70 ? `${name.slice(0, 67)}...` : name}"`;
  const ok = args.channels.filter((c) => c.status === "published");
  const bad = args.channels.filter((c) => c.status === "failed");
  const link = `/composer/${args.postId}`;
  const channelMeta = args.channels.map((c) => ({ platform: c.platform, status: c.status === "published" ? "published" : c.status === "failed" ? "failed" : "other" }));

  if (bad.length === 0) {
    return {
      type: "publish_success",
      title: ok.length > 1 ? `Published to ${ok.length} channels` : `Published to ${platformName(ok[0]?.platform ?? "")}`.trim(),
      body: ok.length > 1 ? `${quoted} is live on ${joinPlatforms(ok.map((c) => c.platform))}.` : `${quoted} is live.`,
      priority: "normal",
      actionLabel: "View post",
      linkUrl: link,
      platform: ok.length === 1 ? ok[0].platform : null,
      metadata: { channels: channelMeta },
    };
  }

  const first = bad[0];
  const kind = classifyFailure(first.error);
  const reason = friendlyReason(first.error);
  const failedNames = joinPlatforms(bad.map((c) => c.platform));
  const actionLabel = kind === "reconnect" ? "Reconnect" : kind === "content" ? "Edit post" : "Retry";
  // Reconnecting happens on Integrations; editing and retrying both happen on the post itself.
  const linkUrl = kind === "reconnect" ? "/integrations" : link;
  const extraActions = [
    ...(kind !== "reconnect" ? [] : [{ label: "View post", url: link }]),
    ...(kind === "reconnect" ? [] : [{ label: "Retry", url: link }]),
  ];
  const base = { channels: channelMeta, failureKind: kind, actions: extraActions };

  if (ok.length > 0) {
    return {
      type: "publish_partial",
      title: `Partly published: ${failedNames} failed`,
      body: `${quoted} went live on ${joinPlatforms(ok.map((c) => c.platform))}, but not on ${failedNames}. ${reason}`,
      priority: "high",
      actionLabel,
      linkUrl,
      platform: bad.length === 1 ? first.platform : null,
      metadata: base,
    };
  }
  return {
    type: "publish_failed",
    title: bad.length > 1 ? `Publishing failed on ${bad.length} channels` : `Publishing to ${platformName(first.platform)} failed`,
    body: `${quoted} could not be published${bad.length > 1 ? ` to ${failedNames}` : ""}. ${reason}`,
    priority: "high",
    actionLabel,
    linkUrl,
    platform: bad.length === 1 ? first.platform : null,
    metadata: base,
  };
}
