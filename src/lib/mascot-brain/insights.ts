import type { Insight, Severity, WorkspaceFacts } from "./types";

/**
 * Turns a snapshot of the workspace into a short, ranked list of things worth
 * the user's attention. Pure: facts in, insights out. Every insight is derived
 * from a measured number in `facts` (nothing is invented), is gated by what the
 * viewer is allowed to act on, and carries an id that includes the magnitude, so
 * a dismissed "2 posts failed" comes back as "5 posts failed" but not before.
 */

const BASE: Record<Severity, number> = { critical: 90, warn: 60, info: 30, win: 20 };

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const list = (items: string[], max = 3) => (items.length <= max ? items.join(", ") : `${items.slice(0, max).join(", ")} and ${items.length - max} more`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function make(id: string, severity: Severity, topic: string, title: string, body: string, bonus = 0, action?: Insight["action"]): Insight {
  return { id, severity, topic, title, body, action, score: BASE[severity] + Math.min(9, Math.max(0, bonus)) };
}

export function buildInsights(f: WorkspaceFacts): Insight[] {
  const has = (...p: string[]) => p.some((x) => f.perms.includes(x));
  const canPublish = has("content.create", "content.edit", "content.publish");
  const canSeeStats = canPublish || has("analytics.view");
  const out: Insight[] = [];

  /* ---- Set-up: the first three steps outrank everything for a new workspace ---- */
  if (f.setup.firstRun || !f.setup.connected) {
    if (!f.setup.connected && has("channels.connect", "integrations.manage")) {
      out.push(make("setup:connect", f.setup.firstRun ? "warn" : "info", "setup", "Connect your first account", "Posts can only go out to platforms you have connected. It takes about a minute.", 8, { label: "Connect an account", href: "/integrations" }));
    }
  }
  if (f.setup.connected && !f.setup.created && canPublish) {
    out.push(make("setup:create", "info", "setup", "Write your first post", "Your account is connected. Draft a post and see how it looks on each platform.", 6, { label: "Open the composer", href: "/composer/new" }));
  } else if (f.setup.created && !f.setup.scheduled && f.setup.connected && canPublish) {
    out.push(make("setup:schedule", "info", "setup", "Schedule something to go out", "You have drafts but nothing scheduled. Pick a time and let it publish itself.", 5, { label: "Open the calendar", href: "/calendar" }));
  }

  /* ---- Things that are broken right now ---- */
  if (canPublish && f.failed.count7d > 0) {
    const first = f.failed.recent[0];
    const why = first?.error ? ` Latest reason: ${first.error.slice(0, 90)}` : "";
    out.push(make(`failed:${f.failed.count7d}`, "critical", "publishing", `${plural(f.failed.count7d, "post")} failed to publish`, `In the last 7 days.${why}`, f.failed.count7d, { label: "Review and retry", href: "/queue" }));
  }
  if (canPublish && f.scheduled.overdue > 0) {
    out.push(make(`overdue:${f.scheduled.overdue}`, "critical", "publishing", `${plural(f.scheduled.overdue, "scheduled post")} overdue`, "Their time has passed and they have not gone out. Check the queue.", f.scheduled.overdue, { label: "Open the queue", href: "/queue" }));
  }
  if (f.accounts.broken.length > 0 && has("channels.connect", "integrations.manage", "content.create")) {
    const names = f.accounts.broken.map((a) => `${a.name} (${a.platform})`);
    out.push(make(`broken:${f.accounts.broken.length}`, "critical", "accounts", `${plural(f.accounts.broken.length, "account")} need reconnecting`, `${cap(list(names))} cannot publish until reconnected.`, f.accounts.broken.length, { label: "Reconnect", href: "/integrations" }));
  }

  /* ---- Needs attention soon ---- */
  if (f.accounts.expiring.length > 0 && has("channels.connect", "integrations.manage", "content.create")) {
    const soonest = Math.min(...f.accounts.expiring.map((a) => a.days));
    const names = f.accounts.expiring.map((a) => `${a.name} (${a.platform})`);
    out.push(make(`expiring:${f.accounts.expiring.length}:${soonest}`, "warn", "accounts", soonest <= 0 ? "A connection expires today" : `A connection expires in ${plural(soonest, "day")}`, `${cap(list(names))}. Reconnect before it lapses so publishing does not stop.`, 7 - Math.min(7, soonest), { label: "Reconnect", href: "/integrations" }));
  }
  if (f.streak && f.streak.status === "at_risk" && !f.streak.todayScheduled && f.streak.current > 0 && canPublish) {
    out.push(make(`streak:${f.streak.current}`, "warn", "habit", `Your ${f.streak.current}-day streak ends tonight`, "Schedule or publish one post today to keep it alive.", Math.min(9, f.streak.current), { label: "Schedule a post", href: "/composer/new" }));
  }
  if (f.approvals.pending > 0 && has("content.approve")) {
    const old = f.approvals.oldestDays ?? 0;
    out.push(make(`approvals:${f.approvals.pending}`, "warn", "approvals", `${plural(f.approvals.pending, "post")} waiting for your review`, old >= 2 ? `The oldest has waited ${plural(old, "day")}.` : "Your team is waiting on a decision.", old, { label: "Review now", href: "/approvals" }));
  }
  if (f.inbox.open > 0 && has("inbox.respond")) {
    out.push(make(`inbox:${f.inbox.open}:${f.inbox.negative}`, f.inbox.negative > 0 ? "warn" : "info", "inbox", `${plural(f.inbox.open, "conversation")} need a reply`, f.inbox.negative > 0 ? `${plural(f.inbox.negative, "message")} look negative. Quick answers protect your reputation.` : "Fast replies help every platform rank you higher.", f.inbox.negative * 2, { label: "Open inbox", href: "/inbox" }));
  }
  if (f.usage && has("workspace.manage", "members.manage")) {
    const u = f.usage;
    const hot = (
      [
        ["ai", "AI credits", u.ai],
        ["scheduled", "scheduled posts", u.scheduled],
        ["channels", "channels", u.channels],
      ] as const
    ).filter(([, , x]) => x.limit > 0 && x.pct >= 90);
    for (const [key, label, x] of hot) {
      out.push(make(`usage:${key}:${x.pct >= 100 ? "over" : "near"}`, x.pct >= 100 ? "critical" : "warn", "limits", x.pct >= 100 ? `You are over your ${label} limit` : `${x.pct}% of your ${label} used`, `${x.used.toLocaleString("en-US")} of ${x.limit.toLocaleString("en-US")} this month. Upgrade to avoid interruptions.`, Math.floor((x.pct - 90) / 2), { label: "See plans", href: "/settings/billing" }));
    }
  }

  /* ---- Opportunities ---- */
  if (canPublish && f.setup.connected) {
    const empty = f.scheduled.byDay.filter((d) => d.count === 0).length;
    if (f.setup.scheduled || f.setup.created) {
      if (empty >= 4) {
        out.push(make(`gaps:${empty}`, "info", "schedule", `Nothing is scheduled on ${empty} of the next 7 days`, "A steady cadence beats bursts. Fill a few of the gaps now.", empty, { label: "Plan the week", href: "/calendar" }));
      }
    }
    if (f.scheduled.next24h > 0) {
      out.push(make(`next24h:${f.scheduled.next24h}`, "info", "schedule", `${plural(f.scheduled.next24h, "post")} go out in the next 24 hours`, "Everything is lined up. Preview them in the calendar.", 0, { label: "View calendar", href: "/calendar" }));
    }
    if (f.drafts.stale >= 3) {
      out.push(make(`drafts:${f.drafts.stale}`, "info", "schedule", `${plural(f.drafts.stale, "draft")} untouched for over a week`, "Finish them or archive them so they do not pile up.", Math.min(5, f.drafts.stale), { label: "Open drafts", href: "/composer" }));
    }
    if (!f.bestTime.insufficient && f.bestTime.label) {
      out.push(make(`best:${f.bestTime.label}`, "info", "growth", `Your best time to post: ${f.bestTime.label}`, `It averaged ${f.bestTime.engagement?.toFixed(1)}% engagement across ${plural(f.bestTime.posts ?? 0, "post")}.`, 0, { label: "Schedule for then", href: "/composer/new" }));
    }
  }
  if (canSeeStats && f.health && f.health.score < 60 && f.health.weakest) {
    out.push(make(`health:${f.health.score}`, "info", "health", `Social health score is ${f.health.score}`, `${f.health.weakest.label} is the weakest part at ${f.health.weakest.value}. Improving it lifts the whole score.`, Math.floor((60 - f.health.score) / 6), { label: "See how to improve", href: "/analytics" }));
  }

  /* ---- Good news (never outranks a problem) ---- */
  if (canSeeStats && f.momentum.prev7d >= 3 && f.momentum.published7d >= Math.ceil(f.momentum.prev7d * 1.25)) {
    const pct = Math.round(((f.momentum.published7d - f.momentum.prev7d) / f.momentum.prev7d) * 100);
    out.push(make(`momentum:${pct}`, "win", "growth", `You published ${pct}% more than last week`, `${plural(f.momentum.published7d, "post")} this week against ${f.momentum.prev7d}. Keep the rhythm.`, 3, { label: "See analytics", href: "/analytics" }));
  }
  if (f.streak && f.streak.nextMilestone !== null && f.streak.daysToNextMilestone !== null && f.streak.daysToNextMilestone > 0 && f.streak.daysToNextMilestone <= 2) {
    out.push(make(`milestone:${f.streak.nextMilestone}`, "win", "habit", `${plural(f.streak.daysToNextMilestone, "day")} to your ${f.streak.nextMilestone}-day milestone`, "Publish daily and you will hit it.", 4, { label: "View streak", href: "/insights/streak" }));
  }

  return out.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

/** The single most useful thing to say unprompted, or null when everything is calm. */
export function topInsight(insights: Insight[], opts: { minSeverity?: Severity } = {}): Insight | null {
  const rank: Record<Severity, number> = { win: 0, info: 1, warn: 2, critical: 3 };
  const min = rank[opts.minSeverity ?? "warn"];
  return insights.find((i) => rank[i.severity] >= min) ?? null;
}

/** How many insights deserve a badge on the companion (problems, not tips). */
export function attentionCount(insights: Insight[]): number {
  return insights.filter((i) => i.severity === "critical" || i.severity === "warn").length;
}
