import { PLATFORM_LABELS } from "@/lib/platform-rules";
import { PREFLIGHT_PREFIX } from "@/lib/post-checks";

/**
 * Turn a raw publish failure (API JSON, status lines, stack-ish text) into one
 * plain sentence a customer can act on. The raw text is kept for debugging in
 * the system event log — it is never shown to the user.
 *
 * Retry decisions are made on the RAW message elsewhere; this only affects what
 * is stored for display.
 */
export function friendlyPublishError(platform: string, raw: string): string {
  const msg = String(raw ?? "");
  const name = PLATFORM_LABELS[platform] ?? platform;

  // Our own pre-flight messages are already written for people.
  if (msg.startsWith(PREFLIGHT_PREFIX)) return msg;

  if (/#190|code[\s:]*190|invalid[_ ]?(token|oauth|grant)|expiredtoken|invalidtoken|token expired|session (has )?expired|revoked|deauthorized|\b401\b/i.test(msg)) {
    return `Your ${name} connection has expired or was revoked. Reconnect the account in Integrations, then retry.`;
  }
  if (platform === "pinterest" && /standard access|hasn't approved this app|consumer type|trial/i.test(msg)) {
    return "Pinterest hasn't approved this app for full access yet, so it can only post to the sandbox. The team needs to complete Pinterest's access review.";
  }
  if (platform === "pinterest" && /board/i.test(msg) && /(no longer exists|not accessible|no pinterest board)/i.test(msg)) {
    return "The Pinterest board for this post is missing or not accessible. Pick another board in the composer or in Integrations, then retry.";
  }
  if (/hashtag/i.test(msg)) return `${name} rejected the hashtags in this post. Remove some hashtags and retry.`;
  if (/too long|text.*(exceed|limit)|exceed.*(length|character|limit)|maximum (length|characters)|character limit|graphemes|\b(2200|280|300|500|3000)\b.*(char|limit)/i.test(msg)) {
    return `${name} says this post's text is too long. Shorten it and retry.`;
  }
  if (/duplicate|already (posted|published|exists)|same (status|content)/i.test(msg)) {
    return `${name} refused this as a duplicate of a recent post. Change the text slightly and retry.`;
  }
  if (/media|image|video|aspect|resolution|codec|format|file size|duration/i.test(msg) && /\b(400|422)\b|invalid|unsupported|too (large|big|small|long|short)/i.test(msg)) {
    return `${name} couldn't accept the attached media. Check its format, size, ratio and length, then retry.`;
  }
  if (/\b429\b|rate.?limit|too many requests|quota/i.test(msg)) {
    return `${name} is limiting how fast we can post right now. We'll retry automatically.`;
  }
  if (/\b403\b|forbidden|permission|not authori[sz]ed|insufficient/i.test(msg)) {
    return `${name} refused permission for this post. Check the account's permissions, reconnect it if needed, then retry.`;
  }
  if (/\b5\d\d\b|timeout|timed out|econn|network|fetch failed|socket|unavailable|gateway|overloaded/i.test(msg)) {
    return `${name} had a temporary problem. We'll retry automatically.`;
  }
  if (/\b(400|404|422)\b/.test(msg)) {
    return `${name} rejected this post's content. Review the text, media and format, then retry.`;
  }
  return `Publishing to ${name} failed. Open the post and retry; if it keeps failing, contact support.`;
}
