/**
 * Serialise structured data for an inline `<script type="application/ld+json">`.
 *
 * Plain JSON.stringify is not safe there: a value containing `</script>` closes the tag and the rest runs as
 * HTML. Titles and FAQ text can come from the blog CMS or user-entered content, so the characters that matter
 * to the HTML parser (and the two JS line separators that break older script parsing) are written as unicode
 * escapes. The result is still valid JSON and parses to exactly the same data.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .split(LINE_SEPARATOR)
    .join("\\u2028")
    .split(PARAGRAPH_SEPARATOR)
    .join("\\u2029");
}
