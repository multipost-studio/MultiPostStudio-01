/**
 * Text measurement. Platforms count "length" differently, so there is no single
 * universal counter: each rule names the method it needs (see CountMethod) and
 * the validator calls `countBy` with it, so the number we show is the number we
 * validate.
 */

export type CountMethod =
  /** Unicode code points: one emoji = 1, but a flag/ZWJ sequence = several. */
  | "characters"
  /** User-perceived characters (extended grapheme clusters). Bluesky. */
  | "graphemes"
  /** UTF-8 bytes. YouTube description. */
  | "bytes"
  /** UTF-16 code units, i.e. JS `.length`. TikTok "runes". */
  | "utf16"
  /** X weighted length: links count as 23, CJK/emoji as 2. */
  | "x_weighted"
  /** Threads: emoji count as their UTF-8 byte length, everything else as 1. */
  | "threads";

let segmenter: Intl.Segmenter | null | undefined;

function getSegmenter(): Intl.Segmenter | null {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  }
  return segmenter;
}

export function countCharacters(text: string): number {
  let n = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- counting iterations, not reading values
  for (const _ of text) n++;
  return n;
}

export function countGraphemes(text: string): number {
  const seg = getSegmenter();
  if (!seg) return countCharacters(text); // ponytail: engines without Intl.Segmenter under-count ZWJ emoji; none of our targets lack it
  let n = 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- counting iterations, not reading values
  for (const _ of seg.segment(text)) n++;
  return n;
}

const encoder = new TextEncoder();

export function countBytes(text: string): number {
  return encoder.encode(text).length;
}

export function countUtf16Units(text: string): number {
  return text.length;
}

const X_URL = /\bhttps?:\/\/[^\s<>"']+/gi;
const X_URL_WEIGHT = 23;

/**
 * Approximation of X's weighted counting (twitter-text): every URL is 23, code
 * points in the CJK / Hangul / Japanese / emoji ranges count 2, everything else
 * 1. It deliberately errs on the side of the documented rules; the platform API
 * remains the final judge.
 */
export function countXWeighted(text: string): number {
  let weight = 0;
  const withoutUrls = text.replace(X_URL, () => {
    weight += X_URL_WEIGHT;
    return "";
  });
  for (const ch of withoutUrls) {
    const cp = ch.codePointAt(0) ?? 0;
    weight += isDoubleWeight(cp) ? 2 : 1;
  }
  return weight;
}

function isDoubleWeight(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
    (cp >= 0x2e80 && cp <= 0x9fff) || // CJK radicals .. unified ideographs, Hiragana, Katakana
    (cp >= 0xa960 && cp <= 0xa97f) ||
    (cp >= 0xac00 && cp <= 0xd7ff) || // Hangul syllables
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe6f) ||
    (cp >= 0xff00 && cp <= 0xff60) || // fullwidth forms
    (cp >= 0xffe0 && cp <= 0xffe6) ||
    (cp >= 0x1f300 && cp <= 0x1faff) || // emoji & pictographs
    (cp >= 0x20000 && cp <= 0x3fffd) // CJK extensions
  );
}

const PICTOGRAPH = /\p{Extended_Pictographic}/u;

/** Threads API: "emojis count as their UTF-8 byte length". Other characters count once. */
export function countThreads(text: string): number {
  let n = 0;
  for (const ch of text) n += PICTOGRAPH.test(ch) ? encoder.encode(ch).length : 1;
  return n;
}

export function countBy(method: CountMethod, text: string): number {
  switch (method) {
    case "graphemes":
      return countGraphemes(text);
    case "bytes":
      return countBytes(text);
    case "utf16":
      return countUtf16Units(text);
    case "x_weighted":
      return countXWeighted(text);
    case "threads":
      return countThreads(text);
    case "characters":
    default:
      return countCharacters(text);
  }
}

export const COUNT_UNIT_LABEL: Record<CountMethod, string> = {
  characters: "characters",
  graphemes: "graphemes",
  bytes: "bytes",
  utf16: "characters",
  x_weighted: "characters",
  threads: "characters",
};
