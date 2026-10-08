import { db } from "@/lib/db";
import { checkUsage } from "@/lib/entitlements";
import { getWorkspaceStreak } from "@/lib/streak-service";
import { recommendTimes } from "@/lib/scheduling";
import { FIRST_RUN_WINDOW_MS } from "@/components/mascot/mascot-config";
import { dayLabel, dayRange, safeZone, shiftYmd, ymdInZone } from "./time";
import type { FactPost, WorkspaceFacts } from "./types";

/**
 * Loads a snapshot of the active workspace for the companion. Every query is
 * scoped to the caller's workspace, selects only the columns it needs, and runs
 * in parallel. Results are cached for a short while per user so the 5-minute
 * poll, several open tabs and a burst of questions cost one pass, not many.
 */

export type FactsContext = {
  user: { id: string; timezone?: string | null; createdAt: Date | string };
  active: { workspace: { id: string }; org: { id: string }; permissions: readonly string[] };
};

const DAY = 86_400_000;
const TTL_MS = 45_000;
const UPCOMING = ["scheduled", "approved"];

const cache = new Map<string, { at: number; facts: Promise<WorkspaceFacts> }>();

export function invalidateFacts(workspaceId?: string) {
  if (!workspaceId) return cache.clear();
  for (const k of cache.keys()) if (k.startsWith(`${workspaceId}:`)) cache.delete(k);
}

export function loadWorkspaceFacts(ctx: FactsContext, now = new Date()): Promise<WorkspaceFacts> {
  const key = `${ctx.active.workspace.id}:${ctx.user.id}`;
  const hit = cache.get(key);
  if (hit && now.getTime() - hit.at < TTL_MS) return hit.facts;
  const facts = compute(ctx, now);
  cache.set(key, { at: now.getTime(), facts });
  // A failed load must not be served from cache for the next 45 seconds.
  facts.catch(() => cache.delete(key));
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return facts;
}

const title = (p: { title: string | null; channels: { body: string }[] }) => (p.title ?? p.channels[0]?.body ?? "Untitled post").replace(/\s+/g, " ").trim().slice(0, 80) || "Untitled post";

async function compute(ctx: FactsContext, now: Date): Promise<WorkspaceFacts> {
  const ws = ctx.active.workspace.id;
  const orgId = ctx.active.org.id;
  const perms = [...ctx.active.permissions];
  const tz = safeZone(ctx.user.timezone);
  const canManage = perms.includes("workspace.manage") || perms.includes("members.manage");
  const nowMs = now.getTime();

  const today = dayRange(now, tz, 0);
  const horizon = dayRange(now, tz, 7).start;
  const weekAgo = new Date(nowMs - 7 * DAY);
  const twoWeeksAgo = new Date(nowMs - 14 * DAY);

  const [
    upcoming,
    overdue,
    failedCount,
    failedRecent,
    drafts,
    approvalCount,
    approvalOldest,
    approvalRecent,
    inboxOpen,
    inboxNegative,
    accounts,
    totalPosts,
    scheduledPosts,
    published7d,
    prev7d,
    health,
    streak,
    best,
    usage,
  ] = await Promise.all([
    db.post.findMany({
      where: { workspaceId: ws, status: { in: UPCOMING }, scheduledAt: { gte: today.start, lt: horizon } },
      orderBy: { scheduledAt: "asc" },
      take: 500,
      select: { id: true, title: true, scheduledAt: true, channels: { select: { platform: true, body: true } } },
    }),
    db.post.count({ where: { workspaceId: ws, status: "scheduled", scheduledAt: { lt: new Date(nowMs - 10 * 60_000) } } }),
    db.post.count({ where: { workspaceId: ws, status: "failed", updatedAt: { gte: weekAgo } } }),
    db.post.findMany({
      where: { workspaceId: ws, status: "failed", updatedAt: { gte: weekAgo } },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, title: true, updatedAt: true, channels: { select: { platform: true, body: true, error: true } } },
    }),
    db.post.count({ where: { workspaceId: ws, status: "draft", updatedAt: { lt: weekAgo } } }),
    db.approvalRequest.count({ where: { post: { workspaceId: ws }, status: { in: ["in_review", "changes_requested"] } } }),
    db.approvalRequest.findFirst({ where: { post: { workspaceId: ws }, status: { in: ["in_review", "changes_requested"] } }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
    db.approvalRequest.findMany({ where: { post: { workspaceId: ws }, status: { in: ["in_review", "changes_requested"] } }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, post: { select: { title: true } } } }),
    db.conversation.count({ where: { workspaceId: ws, status: "open" } }),
    db.conversation.count({ where: { workspaceId: ws, status: "open", sentiment: "negative" } }),
    db.socialAccount.findMany({ where: { workspaceId: ws }, select: { displayName: true, platform: true, status: true, tokenExpiresAt: true }, take: 100 }),
    db.post.count({ where: { workspaceId: ws } }),
    db.post.count({ where: { workspaceId: ws, status: { in: ["scheduled", "approved", "publishing"] } } }),
    db.post.count({ where: { workspaceId: ws, status: "published", publishedAt: { gte: weekAgo } } }),
    db.post.count({ where: { workspaceId: ws, status: "published", publishedAt: { gte: twoWeeksAgo, lt: weekAgo } } }),
    db.healthScore.findFirst({ where: { workspaceId: ws }, orderBy: { date: "desc" } }),
    getWorkspaceStreak(ws, tz).catch(() => null),
    recommendTimes(ws, tz).catch(() => null),
    canManage
      ? Promise.all([checkUsage(orgId, "ai_credits"), checkUsage(orgId, "scheduled_posts"), checkUsage(orgId, "channels")]).catch(() => null)
      : Promise.resolve(null),
  ]);

  /* ---- schedule, bucketed by the viewer's local day ---- */
  const toFact = (p: (typeof upcoming)[number]): FactPost => ({ id: p.id, title: title(p), at: p.scheduledAt?.toISOString() ?? null, platforms: [...new Set(p.channels.map((c) => c.platform))] });
  const todayYmd = ymdInZone(now, tz);
  const tomorrowYmd = shiftYmd(todayYmd, 1);
  const todayPosts: FactPost[] = [];
  const tomorrowPosts: FactPost[] = [];
  const counts = new Map<string, number>();
  let next24h = 0;
  let nextAt: string | null = null;
  for (const p of upcoming) {
    if (!p.scheduledAt) continue;
    const ymd = ymdInZone(p.scheduledAt, tz);
    counts.set(ymd, (counts.get(ymd) ?? 0) + 1);
    if (ymd === todayYmd && todayPosts.length < 8) todayPosts.push(toFact(p));
    if (ymd === tomorrowYmd && tomorrowPosts.length < 8) tomorrowPosts.push(toFact(p));
    const t = p.scheduledAt.getTime();
    if (t >= nowMs && t < nowMs + DAY) next24h += 1;
    if (t >= nowMs && !nextAt) nextAt = p.scheduledAt.toISOString();
  }
  const byDay = Array.from({ length: 7 }, (_, i) => {
    const ymd = shiftYmd(todayYmd, i);
    return { date: ymd, label: dayLabel(dayRange(now, tz, i).start, tz), count: counts.get(ymd) ?? 0 };
  });

  /* ---- accounts ---- */
  const broken = accounts.filter((a) => ["error", "expired", "disconnected"].includes(a.status));
  const expiring = accounts
    .filter((a) => a.status === "connected" && a.tokenExpiresAt && a.tokenExpiresAt.getTime() <= nowMs + 7 * DAY)
    .map((a) => ({ name: a.displayName, platform: a.platform, days: Math.max(0, Math.ceil((a.tokenExpiresAt!.getTime() - nowMs) / DAY)) }));

  /* ---- health, usage, streak, best time ---- */
  const components = health
    ? ([
        ["Consistency", health.consistency],
        ["Engagement", health.engagement],
        ["Growth", health.growth],
        ["Response speed", health.responseSpeed],
        ["Content diversity", health.diversity],
      ] as [string, number][])
    : [];
  const weakest = components.length ? components.reduce((a, b) => (b[1] < a[1] ? b : a)) : null;
  const u = (x: { used: number; limit: number; pct: number }) => ({ used: x.used, limit: x.limit, pct: x.pct });

  return {
    generatedAt: now.toISOString(),
    timeZone: tz,
    perms,
    setup: {
      connected: accounts.some((a) => a.status === "connected"),
      created: totalPosts > 0,
      scheduled: scheduledPosts > 0,
      firstRun: nowMs - new Date(ctx.user.createdAt).getTime() < FIRST_RUN_WINDOW_MS,
    },
    failed: {
      count7d: failedCount,
      recent: failedRecent.map((p) => ({ id: p.id, title: title(p), at: p.updatedAt.toISOString(), platforms: [...new Set(p.channels.map((c) => c.platform))], error: p.channels.find((c) => c.error)?.error ?? null })),
    },
    scheduled: { today: todayPosts, tomorrow: tomorrowPosts, next24h, nextAt, overdue, byDay },
    drafts: { stale: drafts },
    approvals: {
      pending: approvalCount,
      oldestDays: approvalOldest ? Math.floor((nowMs - approvalOldest.createdAt.getTime()) / DAY) : null,
      recent: approvalRecent.map((a) => ({ id: a.id, title: a.post.title ?? "Untitled post" })),
    },
    inbox: { open: inboxOpen, negative: inboxNegative },
    accounts: { total: accounts.length, connected: accounts.filter((a) => a.status === "connected").length, broken: broken.map((a) => ({ name: a.displayName, platform: a.platform, status: a.status })), expiring },
    usage: usage ? { ai: u(usage[0]), scheduled: u(usage[1]), channels: u(usage[2]) } : null,
    streak: streak ? { current: streak.current, status: streak.status, todayScheduled: streak.todayScheduled, nextMilestone: streak.nextMilestone, daysToNextMilestone: streak.daysToNextMilestone } : null,
    health: health ? { score: health.score, weakest: weakest ? { label: weakest[0], value: weakest[1] } : null } : null,
    momentum: { published7d: published7d, prev7d },
    bestTime: best && !best.insufficient && best.bestHour !== null && best.slots[0]
      ? { insufficient: false, label: `${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][best.slots[0].weekday]} at ${String(best.slots[0].hour).padStart(2, "0")}:00`, engagement: best.slots[0].avgEngagementRate, posts: best.slots[0].posts, note: best.note }
      : { insufficient: true, note: best?.note ?? "Not enough published history yet." },
  };
}
