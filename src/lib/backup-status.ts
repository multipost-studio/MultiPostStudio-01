import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { BACKUP_STALE_DAYS } from "@/lib/recovery-status";

/**
 * Live backup status from Supabase's Management API, shown on /admin/recovery next to the hand-kept record. Read only.
 * Needs SUPABASE_ACCESS_TOKEN (a personal access token) and SUPABASE_PROJECT_REF (the id in the dashboard URL); without both
 * the page says it isn't connected. The response is parsed defensively, because this app does not control that API: anything
 * unexpected becomes "couldn't read it", never a guess. The token is never logged or sent anywhere but api.supabase.com.
 *
 * Written from Supabase's documented response shape and tested against sample payloads; not run against a live project.
 */
export type BackupItem = { at: Date; status: string; physical: boolean };
export type BackupStatus = {
  pitr: boolean | null;
  region: string | null;
  items: BackupItem[];
  latestCompletedAt: Date | null;
};

const DAY = 86_400_000;

export function parseBackups(json: unknown): BackupStatus | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.backups)) return null;
  const items: BackupItem[] = [];
  for (const b of o.backups) {
    if (!b || typeof b !== "object") continue;
    const r = b as Record<string, unknown>;
    const at = typeof r.inserted_at === "string" ? new Date(r.inserted_at) : null;
    if (!at || Number.isNaN(at.getTime())) continue;
    items.push({ at, status: typeof r.status === "string" ? r.status.toUpperCase() : "UNKNOWN", physical: r.is_physical_backup === true });
  }
  items.sort((a, b) => b.at.getTime() - a.at.getTime());
  // With point-in-time recovery the latest recoverable moment is reported separately from daily backups.
  const phys = o.physical_backup_data && typeof o.physical_backup_data === "object" ? (o.physical_backup_data as Record<string, unknown>) : null;
  const latestUnix = phys && typeof phys.latest_physical_backup_date_unix === "number" ? new Date(phys.latest_physical_backup_date_unix * 1000) : null;
  const completed = items.filter((i) => i.status === "COMPLETED").map((i) => i.at);
  if (latestUnix && !Number.isNaN(latestUnix.getTime())) completed.push(latestUnix);
  completed.sort((a, b) => b.getTime() - a.getTime());
  return {
    pitr: typeof o.pitr_enabled === "boolean" ? o.pitr_enabled : null,
    region: typeof o.region === "string" ? o.region : null,
    items: items.slice(0, 14),
    latestCompletedAt: completed[0] ?? null,
  };
}

export type Judged = { state: "fresh" | "stale" | "none"; ageDays: number | null };

export function judgeLatest(latest: Date | null, now: Date = new Date()): Judged {
  if (!latest) return { state: "none", ageDays: null };
  const age = now.getTime() - latest.getTime();
  return { state: age > BACKUP_STALE_DAYS * DAY ? "stale" : "fresh", ageDays: Math.max(0, Math.floor(age / DAY)) };
}

export const supabaseConfigured = (): boolean => !!(env.SUPABASE_ACCESS_TOKEN && env.SUPABASE_PROJECT_REF);

export type FetchResult = { ok: true; status: BackupStatus } | { ok: false; reason: "not_configured" | "unreachable" | "rejected" | "unreadable"; detail?: string };

let cache: { at: number; value: FetchResult } | null = null;

export async function fetchSupabaseBackups(now: number = Date.now()): Promise<FetchResult> {
  if (!supabaseConfigured()) return { ok: false, reason: "not_configured" };
  if (cache && now - cache.at < 60_000) return cache.value;
  const ref = encodeURIComponent(env.SUPABASE_PROJECT_REF!);
  let value: FetchResult;
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/backups`, {
      headers: { authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    if (res.status === 401 || res.status === 403) value = { ok: false, reason: "rejected", detail: `Supabase answered ${res.status}` };
    else if (!res.ok) value = { ok: false, reason: "unreachable", detail: `Supabase answered ${res.status}` };
    else {
      const status = parseBackups(await res.json());
      value = status ? { ok: true, status } : { ok: false, reason: "unreadable" };
    }
  } catch (err) {
    logger.warn({ err: err instanceof Error ? err.name : "error" }, "supabase backup status unavailable");
    value = { ok: false, reason: "unreachable" };
  }
  cache = { at: now, value };
  return value;
}
