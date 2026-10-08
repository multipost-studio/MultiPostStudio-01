import type { ParsedIntent } from "./intents";
import { STARTER_QUESTIONS } from "./intents";
import { dayLabel, timeLabel } from "./time";
import type { AnswerItem, FactPost, InsightAction, Insight, MascotAnswer, WorkspaceFacts } from "./types";

/**
 * Turns an understood question plus the live facts into an answer. Pure: every
 * number in a reply comes from `facts`, nothing is generated freehand, and an
 * intent the viewer is not allowed to act on is declined rather than answered.
 */

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const act = (label: string, href: string): InsightAction => ({ label, href });

type Out = Omit<MascotAnswer, "intent" | "confidence"> & Partial<Pick<MascotAnswer, "confidence">>;

function has(f: WorkspaceFacts, ...p: string[]) {
  return p.some((x) => f.perms.includes(x));
}

function postItems(posts: FactPost[], tz: string, withDay = false): AnswerItem[] {
  return posts.map((p) => ({
    label: p.at ? `${timeLabel(new Date(p.at), tz)} · ${p.title}` : p.title,
    sub: [withDay && p.at ? dayLabel(new Date(p.at), tz) : "", p.platforms.join(", ")].filter(Boolean).join(" · ") || undefined,
    href: `/composer/${p.id}`,
  }));
}

const declined = (what: string): Out => ({
  title: "That one is outside your role",
  lines: [`You do not have access to ${what}. Ask a workspace admin if you need it.`],
  items: [],
  actions: [],
  followUps: ["What's scheduled today?"],
});

export function composeAnswer(parsed: ParsedIntent, f: WorkspaceFacts, insights: Insight[]): MascotAnswer {
  const body = build(parsed, f, insights);
  return { intent: parsed.intent, confidence: body.confidence ?? parsed.confidence, title: body.title, lines: body.lines, items: body.items, actions: body.actions, followUps: body.followUps };
}

function build(parsed: ParsedIntent, f: WorkspaceFacts, insights: Insight[]): Out {
  const tz = f.timeZone;
  const canContent = has(f, "content.create", "content.edit", "content.publish", "analytics.view", "content.approve");

  switch (parsed.intent) {
    case "briefing": {
      const urgent = insights.filter((i) => i.severity === "critical" || i.severity === "warn");
      const list = (urgent.length ? urgent : insights).slice(0, 4);
      if (list.length === 0) {
        return { title: "Nothing needs you right now", lines: ["No failures, no waiting reviews, no expiring connections. A good moment to plan ahead."], items: [], actions: [act("Plan the week", "/calendar")], followUps: ["When is the best time to post?", "What's scheduled this week?"] };
      }
      return {
        title: urgent.length ? (urgent.length === 1 ? "One thing needs you" : `${urgent.length} things need you`) : "All clear, a few ideas",
        lines: [],
        items: list.map((i) => ({ label: i.title, sub: i.body, href: i.action?.href })),
        actions: list[0].action ? [list[0].action] : [],
        followUps: ["What's scheduled today?", "Any failed posts?"],
      };
    }

    case "today":
    case "tomorrow": {
      if (!canContent) return declined("the publishing schedule");
      const day = parsed.intent === "today" ? "today" : "tomorrow";
      const posts = parsed.intent === "today" ? f.scheduled.today : f.scheduled.tomorrow;
      if (posts.length === 0) {
        const next = f.scheduled.nextAt ? `The next one goes out ${dayLabel(new Date(f.scheduled.nextAt), tz)} at ${timeLabel(new Date(f.scheduled.nextAt), tz)}.` : "Nothing else is queued yet.";
        return { title: `Nothing is scheduled ${day}`, lines: [next], items: [], actions: [act("Schedule a post", "/composer/new"), act("Open calendar", "/calendar")], followUps: ["What's scheduled this week?", "When is the best time to post?"] };
      }
      return { title: `${plural(posts.length, "post")} scheduled ${day}`, lines: [], items: postItems(posts, tz), actions: [act("Open calendar", "/calendar")], followUps: [day === "today" ? "What's scheduled tomorrow?" : "What's scheduled this week?", "Any failed posts?"] };
    }

    case "week": {
      if (!canContent) return declined("the publishing schedule");
      const total = f.scheduled.byDay.reduce((n, d) => n + d.count, 0);
      const empty = f.scheduled.byDay.filter((d) => d.count === 0);
      return {
        title: total === 0 ? "Nothing is scheduled for the next 7 days" : `${plural(total, "post")} scheduled over the next 7 days`,
        lines: empty.length > 0 && total > 0 ? [`${plural(empty.length, "day")} still empty: ${empty.map((d) => d.label).join(", ")}.`] : [],
        items: f.scheduled.byDay.map((d) => ({ label: d.label, sub: d.count === 0 ? "Nothing scheduled" : plural(d.count, "post"), href: "/calendar" })),
        actions: [act("Plan the week", "/calendar")],
        followUps: ["When is the best time to post?", "What's scheduled today?"],
      };
    }

    case "failed": {
      if (!canContent) return declined("publishing results");
      if (f.failed.count7d === 0) return { title: "No failed posts", lines: ["Nothing has failed to publish in the last 7 days."], items: [], actions: [], followUps: ["What's scheduled today?", "How am I doing this week?"] };
      return {
        title: `${plural(f.failed.count7d, "post")} failed in the last 7 days`,
        lines: f.failed.count7d > f.failed.recent.length ? [`Showing the latest ${f.failed.recent.length}.`] : [],
        items: f.failed.recent.map((p) => ({ label: p.title, sub: [p.platforms.join(", "), p.error ?? "No error recorded"].filter(Boolean).join(" · "), href: `/composer/${p.id}` })),
        actions: [act("Review and retry", "/queue")],
        followUps: ["Are my accounts connected?", "What's scheduled today?"],
      };
    }

    case "best_time": {
      if (!canContent) return declined("engagement data");
      const b = f.bestTime;
      if (b.insufficient || !b.label) return { title: "Not enough data to say yet", lines: [b.note, "I only recommend a time once your own posts show a clear pattern, rather than guessing."], items: [], actions: [act("Schedule a post", "/composer/new")], followUps: ["How am I doing this week?"] };
      return { title: `Your best time: ${b.label}`, lines: [`Posts in that slot averaged ${b.engagement?.toFixed(1)}% engagement across ${plural(b.posts ?? 0, "post")}.`, "This is measured from your own published posts."], items: [], actions: [act("Schedule for then", "/composer/new")], followUps: ["What's scheduled this week?"] };
    }

    case "streak": {
      if (!f.streak) return { title: "No streak data yet", lines: ["Publish or schedule a post and your streak starts."], items: [], actions: [act("Schedule a post", "/composer/new")], followUps: [] };
      const s = f.streak;
      const lines = [s.current > 0 ? `You are on a ${plural(s.current, "day")} streak.` : "You do not have an active streak right now."];
      if (s.status === "at_risk" && !s.todayScheduled && s.current > 0) lines.push("It ends tonight unless you schedule or publish something.");
      if (s.nextMilestone !== null && s.daysToNextMilestone !== null) lines.push(`${plural(s.daysToNextMilestone, "day")} to the ${s.nextMilestone}-day milestone.`);
      return { title: s.current > 0 ? `${s.current}-day streak` : "Start a streak", lines, items: [], actions: [act("View streak", "/insights/streak")], followUps: ["What's scheduled today?"] };
    }

    case "approvals": {
      if (!has(f, "content.approve")) return declined("approvals");
      if (f.approvals.pending === 0) return { title: "No reviews waiting", lines: ["Nothing is waiting for your approval."], items: [], actions: [], followUps: ["Any unread messages?"] };
      return { title: `${plural(f.approvals.pending, "post")} waiting for review`, lines: f.approvals.oldestDays ? [`The oldest has waited ${plural(f.approvals.oldestDays, "day")}.`] : [], items: f.approvals.recent.map((r) => ({ label: r.title, href: "/approvals" })), actions: [act("Review now", "/approvals")], followUps: ["Any unread messages?"] };
    }

    case "inbox": {
      if (!has(f, "inbox.respond")) return declined("the inbox");
      if (f.inbox.open === 0) return { title: "Inbox is calm", lines: ["No open conversations."], items: [], actions: [], followUps: ["What's scheduled today?"] };
      return { title: `${plural(f.inbox.open, "conversation")} open`, lines: f.inbox.negative > 0 ? [`${plural(f.inbox.negative, "message")} look negative. Answer those first.`] : [], items: [], actions: [act("Open inbox", "/inbox")], followUps: ["What should I focus on today?"] };
    }

    case "accounts": {
      const a = f.accounts;
      if (a.total === 0) return { title: "No accounts connected", lines: ["Connect a platform to start publishing."], items: [], actions: [act("Connect an account", "/integrations")], followUps: ["How do I connect Instagram?"] };
      const items: AnswerItem[] = [
        ...a.broken.map((x) => ({ label: `${x.name} (${x.platform})`, sub: `Needs reconnecting: ${x.status}`, href: "/integrations" })),
        ...a.expiring.map((x) => ({ label: `${x.name} (${x.platform})`, sub: x.days <= 0 ? "Expires today" : `Expires in ${plural(x.days, "day")}`, href: "/integrations" })),
      ];
      return {
        title: items.length ? `${plural(items.length, "account")} need attention` : "All accounts healthy",
        lines: [`${a.connected} of ${a.total} connected.`],
        items,
        actions: [act(items.length ? "Reconnect" : "Manage accounts", "/integrations")],
        followUps: ["Any failed posts?"],
      };
    }

    case "usage": {
      if (!has(f, "workspace.manage", "members.manage")) return declined("plan usage");
      if (!f.usage) return { title: "Usage is unavailable", lines: ["I could not read your plan usage just now."], items: [], actions: [act("Open Billing", "/settings/billing")], followUps: [] };
      const row = (label: string, u: { used: number; limit: number; pct: number }): AnswerItem => ({ label, sub: u.limit > 0 ? `${u.used.toLocaleString("en-US")} of ${u.limit.toLocaleString("en-US")} (${u.pct}%)` : `${u.used.toLocaleString("en-US")} used, no limit on your plan`, href: "/settings/billing" });
      const hot = [f.usage.ai, f.usage.scheduled, f.usage.channels].some((u) => u.limit > 0 && u.pct >= 90);
      return { title: hot ? "You are close to a limit" : "Plan usage this month", lines: [], items: [row("AI credits", f.usage.ai), row("Scheduled posts", f.usage.scheduled), row("Channels", f.usage.channels)], actions: [act(hot ? "See plans" : "Open Billing", "/settings/billing")], followUps: [] };
    }

    case "health": {
      if (!canContent) return declined("analytics");
      if (!f.health) return { title: "No health score yet", lines: ["It appears once you have published content with metrics."], items: [], actions: [act("Open analytics", "/analytics")], followUps: [] };
      return { title: `Social health score: ${f.health.score}`, lines: f.health.weakest ? [`${f.health.weakest.label} is the weakest part at ${f.health.weakest.value}. Improving it lifts the whole score.`] : [], items: [], actions: [act("See how to improve", "/analytics")], followUps: ["How am I doing this week?"] };
    }

    case "performance": {
      if (!canContent) return declined("analytics");
      const m = f.momentum;
      const delta = m.prev7d > 0 ? Math.round(((m.published7d - m.prev7d) / m.prev7d) * 100) : null;
      const lines = [`You published ${plural(m.published7d, "post")} in the last 7 days${m.prev7d > 0 ? `, against ${m.prev7d} the week before${delta !== null && delta !== 0 ? ` (${delta > 0 ? "+" : ""}${delta}%)` : ""}` : ""}.`];
      if (f.failed.count7d > 0) lines.push(`${plural(f.failed.count7d, "post")} failed to publish.`);
      if (f.health) lines.push(`Social health score: ${f.health.score}.`);
      return { title: "Your week so far", lines, items: [], actions: [act("Open analytics", "/analytics")], followUps: ["Any failed posts?", "When is the best time to post?"] };
    }

    case "create":
      return { title: "Let's write something", lines: ["Open the composer and pick your channels. Content Studio can draft a first version with AI."], items: [], actions: [act("Open the composer", "/composer/new"), act("Content Studio", "/studio"), act("Capture an idea", "/ideas?new=1")], followUps: ["How do I schedule a post?"] };

    case "navigate":
      return parsed.route
        ? { title: `Open ${parsed.route.label}`, lines: [], items: [], actions: [act(`Go to ${parsed.route.label}`, parsed.route.href)], followUps: [] }
        : { title: "I could not find that page", lines: [], items: [], actions: [], followUps: STARTER_QUESTIONS.slice(0, 3) };

    case "help":
      return parsed.topic
        ? { title: parsed.topic.title, lines: parsed.topic.steps, items: [], actions: [parsed.topic.link], followUps: parsed.suggestions.filter((s) => s !== parsed.topic!.title).slice(0, 2) }
        : { title: "I could not find that", lines: [], items: [], actions: [], followUps: STARTER_QUESTIONS.slice(0, 3) };

    case "greeting": {
      const top = insights.find((i) => i.severity === "critical" || i.severity === "warn");
      return { title: "Hi! I am here.", lines: [top ? `First thing: ${top.title.charAt(0).toLowerCase()}${top.title.slice(1)}.` : "Everything looks calm. Ask me about your schedule, your posts or how to do something."], items: [], actions: top?.action ? [top.action] : [], followUps: STARTER_QUESTIONS.slice(0, 3) };
    }

    case "thanks":
      return { title: "Any time.", lines: ["Ask whenever you need me."], items: [], actions: [], followUps: [] };

    default:
      return {
        title: "I am not sure I got that",
        lines: ["I can answer questions about your schedule, failed posts, approvals, inbox, accounts, usage and results, and I can show you how to do things or open any page."],
        items: [],
        actions: [],
        followUps: parsed.suggestions.length ? parsed.suggestions : STARTER_QUESTIONS.slice(0, 4),
        confidence: 0.1,
      };
  }
}
