import { parseCsv } from "@/lib/csv";

/**
 * Parses an imported list of feature flags (JSON as exported here, or the CSV
 * export). Pure and strict: either every row is valid or nothing is applied, and
 * each problem names its row so it can be fixed in the file.
 */

export type FlagRow = { key: string; description: string | null; enabled: boolean | null; rollout: number | null };
export type FlagImportParse = { ok: true; flags: FlagRow[] } | { ok: false; errors: string[] };

export const FLAG_KEY_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/;
const MAX_FLAGS = 500;
const MAX_DESCRIPTION = 200;

const TRUE = new Set(["yes", "true", "on", "1"]);
const FALSE = new Set(["no", "false", "off", "0"]);

function toBool(v: unknown): boolean | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (TRUE.has(s)) return true;
  if (FALSE.has(s)) return false;
  return "invalid";
}

function toRollout(v: unknown): number | null | "invalid" {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= 0 && n <= 100 ? n : "invalid";
}

function normalize(records: Record<string, unknown>[]): FlagImportParse {
  const errors: string[] = [];
  const flags: FlagRow[] = [];
  const seen = new Set<string>();
  if (records.length === 0) return { ok: false, errors: ["The file contains no flags."] };
  if (records.length > MAX_FLAGS) return { ok: false, errors: [`Too many flags (${records.length}); the limit is ${MAX_FLAGS}.`] };
  records.forEach((r, i) => {
    const row = `Row ${i + 1}`;
    const key = typeof r.key === "string" ? r.key.trim() : "";
    if (!FLAG_KEY_RE.test(key)) {
      errors.push(`${row}: key "${String(r.key ?? "").slice(0, 40)}" must be lowercase letters, digits, "_", "." or "-" (max 64).`);
      return;
    }
    if (seen.has(key)) {
      errors.push(`${row}: "${key}" appears more than once.`);
      return;
    }
    seen.add(key);
    const description = r.description === undefined || r.description === null ? null : String(r.description);
    if (description !== null && description.length > MAX_DESCRIPTION) errors.push(`${row} (${key}): description is longer than ${MAX_DESCRIPTION} characters.`);
    const enabled = toBool(r.enabled);
    if (enabled === "invalid") errors.push(`${row} (${key}): enabled must be yes/no or true/false.`);
    const rollout = toRollout(r.rollout ?? r.rollout_pct);
    if (rollout === "invalid") errors.push(`${row} (${key}): rollout must be a whole number from 0 to 100.`);
    if (enabled !== "invalid" && rollout !== "invalid") flags.push({ key, description, enabled, rollout });
  });
  return errors.length ? { ok: false, errors: errors.slice(0, 20).concat(errors.length > 20 ? [`…and ${errors.length - 20} more.`] : []) } : { ok: true, flags };
}

export function parseFlagImport(text: string): FlagImportParse {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, errors: ["The file is empty."] };

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { ok: false, errors: ["The file is not valid JSON."] };
    }
    const list = Array.isArray(data) ? data : Array.isArray((data as { rows?: unknown })?.rows) ? (data as { rows: unknown[] }).rows : Array.isArray((data as { flags?: unknown })?.flags) ? (data as { flags: unknown[] }).flags : null;
    if (!list) return { ok: false, errors: ['Expected an array of flags, or an object with a "rows" array.'] };
    if (list.some((x) => !x || typeof x !== "object" || Array.isArray(x))) return { ok: false, errors: ["Every entry must be an object with at least a key."] };
    return normalize(list as Record<string, unknown>[]);
  }

  const rows = parseCsv(trimmed);
  if (rows.length < 2) return { ok: false, errors: ["The CSV needs a header row and at least one flag."] };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  if (!header.includes("key")) return { ok: false, errors: ['The CSV header must include a "key" column.'] };
  const records = rows.slice(1).map((cells) => Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""])));
  return normalize(records);
}

export type FlagChange = { key: string; kind: "create" | "update"; details: string[] };

type Existing = { key: string; description: string; enabled: boolean; rollout: number };

/** What applying `flags` would do to the current database state. */
export function planFlagImport(flags: FlagRow[], existing: Existing[]): { changes: FlagChange[]; unchanged: number } {
  const byKey = new Map(existing.map((e) => [e.key, e]));
  const changes: FlagChange[] = [];
  let unchanged = 0;
  for (const f of flags) {
    const cur = byKey.get(f.key);
    if (!cur) {
      changes.push({ key: f.key, kind: "create", details: [`enabled ${f.enabled ?? false}`, `rollout ${f.rollout ?? 0}%`] });
      continue;
    }
    const details: string[] = [];
    if (f.enabled !== null && f.enabled !== cur.enabled) details.push(`enabled ${cur.enabled} → ${f.enabled}`);
    if (f.rollout !== null && f.rollout !== cur.rollout) details.push(`rollout ${cur.rollout}% → ${f.rollout}%`);
    if (f.description !== null && f.description !== cur.description) details.push("description changed");
    if (details.length) changes.push({ key: f.key, kind: "update", details });
    else unchanged += 1;
  }
  return { changes, unchanged };
}
