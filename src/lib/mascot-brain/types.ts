/**
 * Shapes shared by the companion's "brain": the live facts about a workspace,
 * the prioritised insights derived from them, and the answers to questions.
 * Pure types, safe for client and server. Everything here is serialisable.
 */

export type Severity = "critical" | "warn" | "info" | "win";

export type InsightAction = { label: string; href: string };

export interface Insight {
  /** Stable per situation AND per magnitude (e.g. "failed:3"), so a worse situation re-surfaces after a dismissal. */
  id: string;
  severity: Severity;
  title: string;
  body: string;
  action?: InsightAction;
  /** Higher is more important. Used only for ordering. */
  score: number;
  topic: string;
}

export interface FactPost {
  id: string;
  title: string;
  /** ISO time (scheduled time for upcoming posts, last update for failed ones). */
  at: string | null;
  platforms: string[];
  error?: string | null;
}

export interface UsageFact {
  used: number;
  limit: number;
  pct: number;
}

/** A snapshot of the active workspace, loaded from the database (see facts.ts). */
export interface WorkspaceFacts {
  generatedAt: string;
  timeZone: string;
  /** The viewer's resolved permissions: facts they may not act on are never turned into insights. */
  perms: string[];
  setup: { connected: boolean; created: boolean; scheduled: boolean; firstRun: boolean };
  failed: { count7d: number; recent: FactPost[] };
  scheduled: {
    today: FactPost[];
    tomorrow: FactPost[];
    next24h: number;
    nextAt: string | null;
    overdue: number;
    /** Seven local days starting today. */
    byDay: { date: string; label: string; count: number }[];
  };
  drafts: { stale: number };
  approvals: { pending: number; oldestDays: number | null; recent: { id: string; title: string }[] };
  inbox: { open: number; negative: number };
  accounts: {
    total: number;
    connected: number;
    broken: { name: string; platform: string; status: string }[];
    expiring: { name: string; platform: string; days: number }[];
  };
  usage: { ai: UsageFact; scheduled: UsageFact; channels: UsageFact } | null;
  streak: { current: number; status: string; todayScheduled: boolean; nextMilestone: number | null; daysToNextMilestone: number | null } | null;
  health: { score: number; weakest: { label: string; value: number } | null } | null;
  momentum: { published7d: number; prev7d: number };
  bestTime: { insufficient: boolean; label?: string; engagement?: number; posts?: number; note: string };
}

export interface AnswerItem {
  label: string;
  sub?: string;
  href?: string;
}

export interface MascotAnswer {
  intent: string;
  title: string;
  /** Short paragraphs, rendered as plain text. */
  lines: string[];
  items: AnswerItem[];
  actions: InsightAction[];
  /** Questions worth asking next, shown as chips. */
  followUps: string[];
  /** 0..1. Low values make the UI offer suggestions instead of presenting a guess as fact. */
  confidence: number;
}
