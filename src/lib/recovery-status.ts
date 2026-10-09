/**
 * Backup and restore evidence. This app cannot see the database host's backups, so staff record what they verified (a
 * backup exists, a restore was tested) and this turns the record into "fresh / stale / never". Pure.
 */
export const CHECK_KINDS = [
  { id: "backup", label: "Backup verified" },
  { id: "restore_test", label: "Restore tested" },
] as const;
export type CheckKind = (typeof CHECK_KINDS)[number]["id"];

export const CHECK_RESULTS = [
  { id: "ok", label: "Succeeded" },
  { id: "failed", label: "Failed" },
] as const;

export const isCheckKind = (v: unknown): v is CheckKind => CHECK_KINDS.some((k) => k.id === v);
export const isCheckResult = (v: unknown): v is "ok" | "failed" => v === "ok" || v === "failed";

const DAY = 86_400_000;
/** A verified backup older than this is stale (daily backups, plus a weekend of slack). */
export const BACKUP_STALE_DAYS = 8;
/** A successful restore test older than this is overdue (quarterly, plus a few weeks of slack). */
export const RESTORE_TEST_STALE_DAYS = 100;

export type CheckRow = { kind: string; result: string; occurredAt: Date };
export type Freshness = { state: "fresh" | "stale" | "never" | "failing"; lastOkAt: Date | null; lastAnyAt: Date | null; ageDays: number | null };

/** Judge one kind of check. "failing" means the most recent attempt failed, whatever came before it. */
export function freshness(rows: readonly CheckRow[], kind: CheckKind, now: Date = new Date()): Freshness {
  const mine = rows.filter((r) => r.kind === kind).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const lastAny = mine[0] ?? null;
  const lastOk = mine.find((r) => r.result === "ok") ?? null;
  if (!lastAny) return { state: "never", lastOkAt: null, lastAnyAt: null, ageDays: null };
  const limit = (kind === "backup" ? BACKUP_STALE_DAYS : RESTORE_TEST_STALE_DAYS) * DAY;
  const ageDays = lastOk ? Math.max(0, Math.floor((now.getTime() - lastOk.occurredAt.getTime()) / DAY)) : null;
  if (lastAny.result === "failed") return { state: "failing", lastOkAt: lastOk?.occurredAt ?? null, lastAnyAt: lastAny.occurredAt, ageDays };
  if (!lastOk) return { state: "never", lastOkAt: null, lastAnyAt: lastAny.occurredAt, ageDays: null };
  return { state: now.getTime() - lastOk.occurredAt.getTime() > limit ? "stale" : "fresh", lastOkAt: lastOk.occurredAt, lastAnyAt: lastAny.occurredAt, ageDays };
}
