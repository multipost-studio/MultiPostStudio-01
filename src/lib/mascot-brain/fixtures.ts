import type { WorkspaceFacts } from "./types";

/** A calm, fully set-up workspace owned by someone with every permission. Tests override what they care about. */
export function calmFacts(patch: Partial<WorkspaceFacts> = {}): WorkspaceFacts {
  const day = (i: number, count: number) => ({ date: `2026-10-0${6 + i}`, label: `Day ${i}`, count });
  return {
    generatedAt: "2026-10-06T09:00:00.000Z",
    timeZone: "UTC",
    perms: ["content.create", "content.edit", "content.publish", "content.approve", "inbox.respond", "analytics.view", "channels.connect", "integrations.manage", "workspace.manage", "members.manage"],
    setup: { connected: true, created: true, scheduled: true, firstRun: false },
    failed: { count7d: 0, recent: [] },
    scheduled: { today: [], tomorrow: [], next24h: 0, nextAt: null, overdue: 0, byDay: [0, 1, 2, 3, 4, 5, 6].map((i) => day(i, 2)) },
    drafts: { stale: 0 },
    approvals: { pending: 0, oldestDays: null, recent: [] },
    inbox: { open: 0, negative: 0 },
    accounts: { total: 3, connected: 3, broken: [], expiring: [] },
    usage: { ai: { used: 10, limit: 100, pct: 10 }, scheduled: { used: 5, limit: 100, pct: 5 }, channels: { used: 3, limit: 10, pct: 30 } },
    streak: { current: 4, status: "active", todayScheduled: true, nextMilestone: 7, daysToNextMilestone: 3 },
    health: { score: 80, weakest: { label: "Growth", value: 70 } },
    momentum: { published7d: 5, prev7d: 5 },
    bestTime: { insufficient: true, note: "Not enough published history yet." },
    ...patch,
  };
}
