import { findHashtags, removeSpans } from "./entities";
import type { ValidationIssue } from "./types";

/**
 * A proposed edit, computed but NOT applied. The UI shows `removed` to the user
 * and only calls the setters after they confirm — nothing is ever deleted
 * silently.
 */
export type FixPlan = {
  body: string;
  firstComment: string;
  /** Hashtags the plan removes, in order, de-duplicated. */
  removed: string[];
  field: "text" | "firstComment" | "both";
};

/** Plan the removal of exactly the hashtags an issue's fix points at. */
export function planHashtagFix(issue: ValidationIssue, text: { body: string; firstComment: string }): FixPlan | null {
  const fix = issue.fix;
  if (!fix || fix.type !== "remove_hashtags" || fix.spans.length === 0) return null;
  const inBody = fix.spans.filter((s) => (s.in ?? "text") === "text");
  const inComment = fix.spans.filter((s) => s.in === "firstComment");
  const removed = [...new Set(fix.spans.map((s) => s.text))];
  return {
    body: inBody.length ? removeSpans(text.body, inBody) : text.body,
    firstComment: inComment.length ? removeSpans(text.firstComment, inComment) : text.firstComment,
    removed,
    field: inBody.length && inComment.length ? "both" : inComment.length ? "firstComment" : "text",
  };
}

/**
 * "Keep the first N": plan a removal of every distinct hashtag after the Nth,
 * across caption then first comment. Used by the hashtag manager.
 */
export function planKeepFirst(text: { body: string; firstComment: string }, keep: number): FixPlan | null {
  const body = findHashtags(text.body);
  const comment = findHashtags(text.firstComment);
  const order: string[] = [];
  for (const h of [...body, ...comment]) if (!order.includes(h.tag.toLowerCase())) order.push(h.tag.toLowerCase());
  if (order.length <= keep) return null;
  const doomed = new Set(order.slice(keep));
  const bodySpans = body.filter((h) => doomed.has(h.tag.toLowerCase()));
  const commentSpans = comment.filter((h) => doomed.has(h.tag.toLowerCase()));
  return {
    body: bodySpans.length ? removeSpans(text.body, bodySpans) : text.body,
    firstComment: commentSpans.length ? removeSpans(text.firstComment, commentSpans) : text.firstComment,
    removed: [...new Set([...bodySpans, ...commentSpans].map((h) => h.text))],
    field: bodySpans.length && commentSpans.length ? "both" : commentSpans.length ? "firstComment" : "text",
  };
}

/**
 * Add one hashtag to a caption: onto the trailing hashtag line if there is one,
 * otherwise on a new paragraph. Returns the input unchanged if the tag is
 * invalid or already present (case-insensitive).
 */
export function appendHashtag(body: string, rawTag: string): string {
  const tag = rawTag.trim().replace(/^#+/, "").replace(/[^\p{L}\p{M}\p{N}_]/gu, "");
  if (!tag || /^\d+$/.test(tag)) return body;
  if (findHashtags(body).some((h) => h.tag.toLowerCase() === tag.toLowerCase())) return body;
  const trimmed = body.trimEnd();
  if (!trimmed) return `#${tag}`;
  const lastLine = trimmed.split("\n").pop() ?? "";
  const onlyTags = lastLine.trim() !== "" && lastLine.split(/\s+/).every((tok) => /^#[\p{L}\p{M}\p{N}_]+$/u.test(tok));
  return onlyTags ? `${trimmed} #${tag}` : `${trimmed}\n\n#${tag}`;
}

/** Remove every occurrence of one hashtag (case-insensitive) from a text. */
export function removeHashtag(text: string, tag: string): string {
  const key = tag.replace(/^#+/, "").toLowerCase();
  const spans = findHashtags(text).filter((h) => h.tag.toLowerCase() === key);
  return spans.length ? removeSpans(text, spans) : text;
}
