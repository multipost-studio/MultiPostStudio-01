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
/** The parts of a Meta (Graph) error worth reading: its code, its own plain-language explanation, and its message. */
function readGraphError(msg: string) {
  const pick = (re: RegExp) => msg.match(re)?.[1];
  const unescape = (t?: string) => (t ? t.replace(/\\"/g, '"').replace(/\\n/g, " ").slice(0, 300) : undefined);
  return {
    code: pick(/"code"\s*:\s*(\d+)/),
    subcode: pick(/"error_subcode"\s*:\s*(\d+)/),
    userMsg: unescape(pick(/"error_user_msg"\s*:\s*"((?:[^"\\]|\\.)*)"/)),
    message: unescape(pick(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/)),
  };
}

/**
 * Meta's Instagram errors, said for what they are. Before this every 400 from Instagram was reported as "couldn't accept the
 * attached media", because every Instagram request path contains "/media". Returns null when it has nothing more specific.
 */
function friendlyMetaError(name: string, msg: string): string | null {
  const processed = msg.match(/could not process the video \((\w+)\):\s*(.*)$/i);
  if (processed) {
    const why = processed[2] && !/no detail given/i.test(processed[2]) ? ` Instagram says: ${processed[2].replace(/^Error:\s*/i, "")}.` : "";
    return `${name} couldn't process the video.${why} Use an MP4 with H.264 video and AAC audio (9:16 for Reels), then retry.`;
  }
  if (/upload expired|\(EXPIRED\)/i.test(msg)) return `${name}'s upload expired before it was published. We'll upload it again on the next try.`;
  if (/still processing|2207027|\b9007\b|not (yet )?ready for publishing|media id is not available/i.test(msg)) {
    return `${name} is still processing the video. We'll retry automatically; if it keeps failing, try again in a few minutes.`;
  }
  const g = readGraphError(msg);
  const text = `${g.userMsg ?? ""} ${g.message ?? ""}`;
  if (/audio|music|sound/i.test(text)) {
    return `${name} couldn't use the music track${g.userMsg ? `: ${g.userMsg}` : ""}. Remove it or choose another, then retry.`;
  }
  if (/trial/i.test(text)) return `${name} wouldn't publish this as a trial reel${g.userMsg ? `: ${g.userMsg}` : ""}. Switch Trial reel to Off (it needs an account with enough followers), then retry.`;
  if (/collaborat/i.test(text)) return `${name} couldn't add a collaborator${g.userMsg ? `: ${g.userMsg}` : ""}. Check the usernames are public professional accounts, or remove them, then retry.`;
  if (/location/i.test(text)) return `${name} couldn't use that location. Remove it or pick another, then retry.`;
  if (g.subcode === "2207003" || /timed? ?out.*download|download.*time/i.test(text)) return `${name} couldn't download the file from its link in time. Retry in a moment.`;
  if (g.subcode === "2207026" || /unsupported video|video format|file format/i.test(text)) {
    return `${name} doesn't support this video format. Use an MP4 with H.264 video and AAC audio, then retry.`;
  }
  if (g.code && ["10", "200", "203"].includes(g.code)) {
    return `${name} refused permission for this post${g.userMsg ? `: ${g.userMsg}` : ""}. Check the account's permissions, reconnect it if needed, then retry.`;
  }
  // Anything else Instagram explained in plain words: pass its explanation on.
  if (g.userMsg) return `${name} says: ${g.userMsg}`;
  return null;
}

/** True when Instagram refused the post because of its trial-reel setting (not for another reason that merely mentions "trial"). */
export function isInstagramTrialReelRefusal(raw: string): boolean {
  const g = readGraphError(String(raw ?? ""));
  return /trial/i.test(`${g.userMsg ?? ""} ${g.message ?? ""}`);
}

export function friendlyPublishError(platform: string, raw: string): string {
  const msg = String(raw ?? "");
  const name = PLATFORM_LABELS[platform] ?? platform;

  // Our own pre-flight messages are already written for people.
  if (msg.startsWith(PREFLIGHT_PREFIX)) return msg;

  if (/#190|code[\s:]*190|invalid[_ ]?(token|oauth|grant)|expiredtoken|invalidtoken|token expired|session (has )?expired|revoked|deauthorized|\b401\b/i.test(msg)) {
    return `Your ${name} connection has expired or was revoked. Reconnect the account in Integrations, then retry.`;
  }
  if (platform === "instagram" || platform === "facebook" || platform === "threads") {
    const meta = friendlyMetaError(name, msg);
    if (meta) return meta;
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
  const bare = msg.replace(/\bGraph\s+\S+/g, "Graph"); // the request path contains "/media" for every Instagram call
  if (/media|image|video|aspect|resolution|codec|format|file size|duration/i.test(bare) && /\b(400|422)\b|invalid|unsupported|too (large|big|small|long|short)/i.test(bare)) {
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
