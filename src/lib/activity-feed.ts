/**
 * Display shaping for the admin Overview "Activity" cards. Pure and tested:
 * raw event text is noisy (query strings, tracing tokens, JSON blobs, local
 * file paths, the same failure repeated per URL), and a card that shows it
 * verbatim is long, uneven and hard to scan. These helpers turn a raw stream
 * into a short list of distinct things with a repeat count.
 */

const MAX_TITLE = 160;

/** One readable line: no JSON metadata, no query strings or tokens, no long file paths. */
export function cleanEventTitle(message: string | null | undefined): string {
  let m = (message ?? "").trim();
  // Multi-line errors (Prisma, stack traces): the first real line is the summary.
  m = m.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? "";
  // Trailing structured metadata appended by recordSystemEvent.
  m = m.replace(/\s*\{["'][\s\S]*\}\s*$/, "");
  // "/dashboard?range=90&_rsc=abc" -> "/dashboard"
  m = m.replace(/(\/[\w\-./[\]]*)\?\S*/g, "$1");
  // Long absolute paths (Windows or POSIX) add nothing for an admin.
  m = m.replace(/[A-Za-z]:\\\S{20,}/g, "…").replace(/(?<![\w:])\/(?:[\w.-]+\/){3,}[\w.-]*/g, "…");
  m = m.replace(/\s+/g, " ").trim();
  return m.length > MAX_TITLE ? `${m.slice(0, MAX_TITLE - 1)}…` : m;
}

export type FeedEvent = { id: string; level: string; source: string; message: string; createdAt: Date };
export type GroupedEvent = { id: string; level: string; source: string; title: string; count: number; at: string };

/** Distinct events, most recent first, with how many times each happened. */
export function groupSystemEvents(events: readonly FeedEvent[], limit: number): GroupedEvent[] {
  const groups = new Map<string, GroupedEvent>();
  for (const e of [...events].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const title = cleanEventTitle(e.message);
    const key = `${e.level}|${e.source}|${title}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { id: e.id, level: e.level, source: e.source, title, count: 1, at: e.createdAt.toISOString() });
  }
  // Map preserves insertion order and we inserted newest first, so no re-sort is needed.
  return [...groups.values()].slice(0, limit);
}

export type FeedAudit = { id: string; action: string; actor: string; createdAt: Date };
export type GroupedAudit = { id: string; action: string; actor: string; count: number; at: string };

/** Admin actions: the same person doing the same thing repeatedly (toggling a card on and off) becomes one row with a count. */
export function groupAuditActions(rows: readonly FeedAudit[], limit: number): GroupedAudit[] {
  const groups = new Map<string, GroupedAudit>();
  for (const r of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    const key = `${r.actor}|${r.action}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { id: r.id, action: r.action, actor: r.actor, count: 1, at: r.createdAt.toISOString() });
  }
  return [...groups.values()].slice(0, limit);
}
