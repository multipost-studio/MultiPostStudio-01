/** Split a thread body into its posts (blank line or a lone "---" separates). */
export function splitThread(body: string): string[] {
  return body
    .split(/\n\s*(?:---)?\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** First non-empty line, trimmed: what YouTube and Pinterest use as the title. */
export function firstLine(body: string): string {
  return (body.split("\n").find((l) => l.trim()) ?? "").trim();
}

/** Platforms whose publisher derives the title from the first line of the body. */
export const TITLE_FROM_FIRST_LINE: readonly string[] = ["youtube", "pinterest"];
