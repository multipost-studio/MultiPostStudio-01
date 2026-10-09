/**
 * Plain-language summary of what a config revision changed. Pure.
 * Compares the top-level fields of the two JSON documents; anything unreadable counts as "everything".
 */
function parse(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Top-level field names whose value differs, sorted. Null when either side is not a JSON object (a reset, or a damaged value). */
export function changedFields(before: string | null, after: string): string[] | null {
  const a = parse(before);
  const b = parse(after);
  if (!a || !b) return null;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
}

export function describeChange(before: string | null, after: string): string {
  if (after === "") return "Reset to defaults";
  if (before === null) return "First saved version";
  const fields = changedFields(before, after);
  if (fields === null) return "Replaced";
  if (fields.length === 0) return "Saved with no changes";
  const shown = fields.slice(0, 4).join(", ");
  return fields.length > 4 ? `Changed ${shown} and ${fields.length - 4} more` : `Changed ${shown}`;
}

/** Pretty JSON for the "view" panel, capped so one huge config cannot flood the page. */
export function prettyConfig(raw: string | null, max = 8000): string {
  if (raw === null) return "(did not exist)";
  if (raw === "") return "(defaults)";
  let text = raw;
  try {
    text = JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    /* show as stored */
  }
  return text.length > max ? `${text.slice(0, max)}\n… (${text.length - max} more characters)` : text;
}
