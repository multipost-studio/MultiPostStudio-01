/**
 * One reusable parser for the things inside a caption that platforms count or
 * restrict: hashtags, mentions and links. Used by validation, previews,
 * adaptation and publishing so they can never disagree about what "a hashtag" is.
 *
 * All results carry their index in the ORIGINAL text so a fix can remove exactly
 * the span the user was shown.
 */

export type Entity = { text: string; start: number; end: number };
export type Hashtag = Entity & { tag: string };

// http(s) links and bare www. links. Stripped before hashtag/mention matching so
// `site.com/page#section` and `me@host` are never miscounted.
const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

export function findUrls(text: string): Entity[] {
  const out: Entity[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    const trimmed = raw.replace(TRAILING_PUNCT, "");
    const start = m.index ?? 0;
    out.push({ text: trimmed, start, end: start + trimmed.length });
  }
  return out;
}

/** Replace URLs with same-length filler so match indexes stay valid. */
function maskUrls(text: string): string {
  return text.replace(URL_RE, (m) => " ".repeat(m.length));
}

// A hashtag starts at the beginning or after a character that is not a word
// character, `&`, `/`, `#` or `@`; its body is letters/marks/digits/underscore
// and must contain at least one non-digit (#123 is not a hashtag).
const HASHTAG_RE = /(^|[^\p{L}\p{M}\p{N}_&/#@])#([\p{L}\p{M}\p{N}_]+)/gu;

export function findHashtags(text: string): Hashtag[] {
  const out: Hashtag[] = [];
  for (const m of maskUrls(text).matchAll(HASHTAG_RE)) {
    const body = m[2];
    if (/^\d+$/.test(body)) continue;
    const start = (m.index ?? 0) + m[1].length;
    out.push({ tag: body, text: `#${body}`, start, end: start + body.length + 1 });
  }
  return out;
}

/** Distinct hashtags, case-insensitive: "#AI #ai" is one tag to every platform. */
export function uniqueHashtags(text: string): Hashtag[] {
  const seen = new Set<string>();
  return findHashtags(text).filter((h) => {
    const k = h.tag.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// @handle, optionally dotted (Bluesky: @name.bsky.social). Preceded by start or a
// non-word char so emails don't match.
const MENTION_RE = /(^|[^\p{L}\p{N}_@.])@([A-Za-z0-9_](?:[A-Za-z0-9_.-]*[A-Za-z0-9_])?)/gu;

export function findMentions(text: string): Entity[] {
  const out: Entity[] = [];
  for (const m of maskUrls(text).matchAll(MENTION_RE)) {
    const start = (m.index ?? 0) + m[1].length;
    out.push({ text: `@${m[2]}`, start, end: start + m[2].length + 1 });
  }
  return out;
}

/**
 * Remove the given spans from `text`, collapsing the whitespace they leave
 * behind. Pure: returns a new string.
 */
export function removeSpans(text: string, spans: { start: number; end: number }[]): string {
  const sorted = [...spans].sort((a, b) => b.start - a.start);
  let out = text;
  for (const s of sorted) out = out.slice(0, s.start) + out.slice(s.end);
  return out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
