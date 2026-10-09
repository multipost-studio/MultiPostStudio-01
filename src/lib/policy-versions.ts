/**
 * Published versions of legal and policy documents. Append-only: a correction is a new version, never an edit, so the
 * history of what was in force when is preserved. Pure helpers for validation and for "which version is in force".
 */
export const POLICY_TYPES = [
  { id: "terms", label: "Terms of service" },
  { id: "privacy", label: "Privacy policy" },
  { id: "dpa", label: "Data processing agreement" },
  { id: "cookies", label: "Cookie policy" },
  { id: "other", label: "Other policy" },
] as const;
export type PolicyType = (typeof POLICY_TYPES)[number]["id"];

export const isPolicyType = (v: unknown): v is PolicyType => POLICY_TYPES.some((t) => t.id === v);
export const policyTypeLabel = (v: string): string => POLICY_TYPES.find((t) => t.id === v)?.label ?? v;

export const VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,19}$/;
export const SUMMARY_MAX = 1000;
export const TITLE_MAX = 120;

/** A link to the document: a path on this site, or an https URL. Anything else (javascript:, http:, data:) is refused. */
export function safePolicyUrl(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.startsWith("/") && !t.startsWith("//") && !/[\s\\]/.test(t)) return t.slice(0, 300);
  try {
    const u = new URL(t);
    return u.protocol === "https:" && t.length <= 300 ? u.toString() : null;
  } catch {
    return null;
  }
}

export type VersionRow = { type: string; version: string; effectiveAt: Date };

/** The version in force for a type: the one with the latest effective date that is not in the future. */
export function inForce(rows: readonly VersionRow[], type: string, now: Date = new Date()): VersionRow | null {
  const live = rows.filter((r) => r.type === type && r.effectiveAt.getTime() <= now.getTime());
  return live.sort((a, b) => b.effectiveAt.getTime() - a.effectiveAt.getTime())[0] ?? null;
}

export function isUpcoming(row: VersionRow, now: Date = new Date()): boolean {
  return row.effectiveAt.getTime() > now.getTime();
}
