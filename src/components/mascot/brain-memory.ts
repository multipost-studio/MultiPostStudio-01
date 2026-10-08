import type { Insight, Severity } from "@/lib/mascot-brain/types";

/**
 * What the companion remembers between visits, kept in this browser only:
 * which insights you waved away (and until when) and what you asked recently.
 * Pure helpers plus a guarded localStorage wrapper. A cleared or blocked store
 * just means the companion forgets. It never breaks anything.
 */

export const BRAIN_KEY = "mps-mascot-brain";

export type BrainMemory = {
  /** insight id -> epoch ms until which it stays quiet */
  snoozed: Record<string, number>;
  recentQuestions: string[];
};

export const EMPTY_MEMORY: BrainMemory = { snoozed: {}, recentQuestions: [] };

const HOUR = 3_600_000;
/** How long a dismissed insight stays quiet. Problems return sooner than tips; a worse state has a new id and returns at once. */
export const SNOOZE_MS: Record<Severity, number> = { critical: 6 * HOUR, warn: 24 * HOUR, info: 72 * HOUR, win: 7 * 24 * HOUR };

export function mergeMemory(raw: unknown, now = Date.now()): BrainMemory {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...EMPTY_MEMORY, snoozed: {} };
  const r = raw as { snoozed?: unknown; recentQuestions?: unknown };
  const snoozed: Record<string, number> = {};
  if (r.snoozed && typeof r.snoozed === "object" && !Array.isArray(r.snoozed)) {
    for (const [id, until] of Object.entries(r.snoozed as Record<string, unknown>)) {
      if (typeof until === "number" && until > now && id.length <= 80) snoozed[id] = until; // expired entries are dropped on read
    }
  }
  const recentQuestions = Array.isArray(r.recentQuestions) ? r.recentQuestions.filter((q): q is string => typeof q === "string" && q.length > 0 && q.length <= 200).slice(0, 5) : [];
  return { snoozed, recentQuestions };
}

export function isSnoozed(mem: BrainMemory, id: string, now = Date.now()): boolean {
  return (mem.snoozed[id] ?? 0) > now;
}

export function snooze(mem: BrainMemory, insight: Pick<Insight, "id" | "severity">, now = Date.now()): BrainMemory {
  return { ...mem, snoozed: { ...mem.snoozed, [insight.id]: now + SNOOZE_MS[insight.severity] } };
}

export function rememberQuestion(mem: BrainMemory, question: string): BrainMemory {
  const q = question.trim();
  if (!q) return mem;
  const rest = mem.recentQuestions.filter((x) => x.toLowerCase() !== q.toLowerCase());
  return { ...mem, recentQuestions: [q, ...rest].slice(0, 5) };
}

export function visibleInsights(insights: Insight[], mem: BrainMemory, now = Date.now()): Insight[] {
  return insights.filter((i) => !isSnoozed(mem, i.id, now));
}

const RANK: Record<Severity, number> = { win: 0, info: 1, warn: 2, critical: 3 };

/** Which insight topics belong to which page, so the companion says what is relevant where you are. */
const PAGE_TOPICS: [string, string[]][] = [
  ["/integrations", ["accounts"]],
  ["/approvals", ["approvals"]],
  ["/inbox", ["inbox"]],
  ["/comments", ["inbox"]],
  ["/queue", ["publishing"]],
  ["/calendar", ["publishing", "schedule"]],
  ["/composer", ["publishing", "schedule"]],
  ["/settings/billing", ["limits"]],
  ["/analytics", ["growth", "health"]],
  ["/insights", ["growth", "health", "habit"]],
];

/**
 * The one insight worth saying unprompted: a problem (warn or worse), not
 * snoozed, not already mentioned this session, and not pointing at the page you
 * are already on. Among problems of the same severity, the ones that belong to
 * the current page come first. Null keeps the companion quiet.
 */
export function pickProactive(insights: Insight[], mem: BrainMemory, mentioned: ReadonlySet<string>, now = Date.now(), pathname = ""): Insight | null {
  const here = PAGE_TOPICS.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`))?.[1] ?? [];
  const candidates = insights.filter(
    (i) =>
      RANK[i.severity] >= RANK.warn &&
      !isSnoozed(mem, i.id, now) &&
      !mentioned.has(i.id) &&
      !(i.action && pathname && (pathname === i.action.href || pathname.startsWith(`${i.action.href}/`))),
  );
  // Stable: severity order from the ranked input is kept, relevance only reorders equal severities.
  return [...candidates].sort((a, b) => RANK[b.severity] - RANK[a.severity] || Number(here.includes(b.topic)) - Number(here.includes(a.topic)))[0] ?? null;
}

/** Stops nagging: after two waved-away proactive messages in a session, or three shown, stay quiet until the next visit. */
export function proactiveBudgetLeft(session: { shown: number; ignored: number }): boolean {
  return session.shown < 3 && session.ignored < 2;
}

export function loadMemory(): BrainMemory {
  try {
    const raw = window.localStorage.getItem(BRAIN_KEY);
    return raw ? mergeMemory(JSON.parse(raw) as unknown) : { ...EMPTY_MEMORY, snoozed: {} };
  } catch {
    return { ...EMPTY_MEMORY, snoozed: {} };
  }
}

export function saveMemory(mem: BrainMemory): void {
  try {
    window.localStorage.setItem(BRAIN_KEY, JSON.stringify(mem));
  } catch {
    /* storage unavailable: memory just does not persist */
  }
}
