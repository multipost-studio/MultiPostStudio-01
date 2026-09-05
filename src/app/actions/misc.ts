"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAnalytics } from "@/lib/analytics";
import { fetchTrends } from "@/lib/adapters/trends";
import { generateOpportunities } from "@/lib/opportunities";
import { withPermission, ok, fail } from "./_helpers";

/* ---------------- Trends ---------------- */

/** Pull live trends from Hacker News + Reddit and replace this workspace's set. */
export async function refreshTrendsAction() {
  const ctx = await withPermission("analytics.view");
  const rows = await fetchTrends();
  if (rows.length === 0) {
    return fail("Couldn't reach the trend sources just now. Try again in a minute.");
  }
  await db.$transaction([
    db.trend.deleteMany({ where: { workspaceId: ctx.active.workspace.id } }),
    db.trend.createMany({
      data: rows.map((t) => ({ ...t, workspaceId: ctx.active.workspace.id })),
    }),
  ]);
  revalidatePath("/trends");
  return ok(undefined, `Loaded ${rows.length} live trends`);
}

/* ---------------- Insights ---------------- */

const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/**
 * Rebuild insights from this workspace's real analytics — measured format
 * lift, real best posting slot, real follower-growth delta, real cadence.
 * Emits a card only when the underlying signal exists; nothing is invented.
 */
export async function regenerateInsightsAction() {
  const ctx = await withPermission("analytics.view");
  const wsId = ctx.active.workspace.id;
  const a = await getAnalytics(wsId, 30);

  type Item = { category: string; severity: string; what: string; why: string; action: string; metricDelta: number };
  const items: Item[] = [];

  // 1. Best-performing format (measured engagement rate).
  const fmts = a.byFormat.filter((f) => f.posts >= 2 && f.avgEngagementRate > 0).sort((x, y) => y.avgEngagementRate - x.avgEngagementRate);
  if (fmts.length >= 2) {
    const lead = fmts[0];
    const restAvg = mean(fmts.slice(1).map((f) => f.avgEngagementRate));
    const lift = restAvg > 0 ? ((lead.avgEngagementRate - restAvg) / restAvg) * 100 : 0;
    if (lift > 10) {
      items.push({
        category: "format",
        severity: "positive",
        what: `Your ${lead.format} posts average ${lead.avgEngagementRate.toFixed(1)}% engagement — ${lift.toFixed(0)}% above your other formats.`,
        why: `Measured across ${lead.posts} ${lead.format.toLowerCase()} posts in the last 30 days.`,
        action: `Shift 1–2 weekly slots toward ${lead.format} and batch-produce ahead.`,
        metricDelta: Math.round(lift),
      });
    }
  }

  // 2. Strongest posting slot (real, from the engagement heatmap).
  const slot = a.bestSlots.find((s) => s.value > 0);
  if (slot) {
    const h = slot.hour % 12 || 12;
    const ampm = slot.hour < 12 ? "AM" : "PM";
    items.push({
      category: "timing",
      severity: "info",
      what: `${DOW[slot.day]} ${h} ${ampm} is your strongest slot — ${slot.value.toFixed(1)}% engagement across ${slot.posts} posts.`,
      why: "Based on when your published posts actually earned engagement.",
      action: `Reserve ${DOW[slot.day]} ${h} ${ampm} for your priority posts.`,
      metricDelta: Math.round(slot.value),
    });
  }

  // 3. Follower-growth trend (real delta vs previous window).
  if (Math.abs(a.deltas.followerGrowth) > 0.5) {
    const up = a.deltas.followerGrowth >= 0;
    items.push({
      category: "performance",
      severity: up ? "positive" : "warning",
      what: `Follower growth is ${up ? "up" : "down"} ${Math.abs(a.deltas.followerGrowth).toFixed(1)}% vs the previous 30 days.`,
      why: up ? "Net new followers outpaced the prior period." : "Net follower change fell below the prior period.",
      action: up ? "Hold the current cadence and format mix." : "Rebuild to a steady 4–5 posts/week using the queue.",
      metricDelta: Math.round(a.deltas.followerGrowth),
    });
  }

  // 4. Posting cadence (real count).
  const perWeek = a.postCount / (30 / 7);
  if (a.postCount > 0 && perWeek < 3) {
    items.push({
      category: "performance",
      severity: "warning",
      what: `You published ${a.postCount} posts in 30 days (~${perWeek.toFixed(1)}/week).`,
      why: "Consistent cadence is the strongest driver of reach growth.",
      action: "Aim for 4–5/week — fill the queue and turn on evergreen recycling.",
      metricDelta: -Math.round((3 - perWeek) * 10),
    });
  }

  if (items.length === 0) {
    return fail("Not enough published data yet — publish a few posts and let metrics accrue first.");
  }

  await db.insight.deleteMany({ where: { workspaceId: wsId, dismissed: false } });
  for (const x of items) await db.insight.create({ data: { workspaceId: wsId, ...x } });
  revalidatePath("/insights");
  revalidatePath("/dashboard");
  return ok(undefined, `${items.length} insight${items.length === 1 ? "" : "s"} refreshed`);
}

export async function dismissInsightAction(id: string) {
  const ctx = await withPermission("analytics.view");
  await db.insight.updateMany({ where: { id, workspaceId: ctx.active.workspace.id }, data: { dismissed: true } });
  revalidatePath("/insights");
  return ok();
}

/* ---------------- Opportunities ---------------- */

export async function setOpportunityStatusAction(id: string, status: "open" | "planned" | "dismissed") {
  const ctx = await withPermission("analytics.view");
  await db.opportunity.updateMany({ where: { id, workspaceId: ctx.active.workspace.id }, data: { status } });
  revalidatePath("/opportunities");
  return ok();
}

/**
 * Rebuild the workspace's open opportunities from real post-history gap
 * analysis. Planned/dismissed items are left untouched.
 */
export async function refreshOpportunitiesAction() {
  const ctx = await withPermission("analytics.view");
  const items = await generateOpportunities(ctx.active.workspace.id);
  if (items.length === 0) {
    return fail("Not enough published-post history yet to spot gaps — publish a few more posts and try again.");
  }
  await db.$transaction([
    db.opportunity.deleteMany({ where: { workspaceId: ctx.active.workspace.id, status: "open" } }),
    db.opportunity.createMany({
      data: items.map((o) => ({ workspaceId: ctx.active.workspace.id, ...o })),
    }),
  ]);
  revalidatePath("/opportunities");
  return ok(undefined, `Found ${items.length} opportunit${items.length === 1 ? "y" : "ies"}`);
}

/* ---------------- Recycling rules ---------------- */

const ruleSchema = z.object({
  name: z.string().min(2).max(100),
  frequencyDays: z.coerce.number().int().min(1).max(365),
  maxReposts: z.coerce.number().int().min(1).max(50),
  minGapDays: z.coerce.number().int().min(1).max(365),
});

export async function createRecycleRuleAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("content.edit");
  const parsed = ruleSchema.safeParse({
    name: formData.get("name"),
    frequencyDays: formData.get("frequencyDays"),
    maxReposts: formData.get("maxReposts"),
    minGapDays: formData.get("minGapDays"),
  });
  if (!parsed.success) return fail("Check the rule values");
  await db.recycleRule.create({ data: { workspaceId: ctx.active.workspace.id, ...parsed.data } });
  revalidatePath("/recycling");
  return ok(undefined, "Recycle rule created");
}

export async function toggleRecycleRuleAction(id: string, enabled: boolean) {
  const ctx = await withPermission("content.edit");
  await db.recycleRule.updateMany({ where: { id, workspaceId: ctx.active.workspace.id }, data: { enabled } });
  revalidatePath("/recycling");
  return ok();
}

export async function deleteRecycleRuleAction(id: string) {
  const ctx = await withPermission("content.edit");
  // Scope BOTH statements to this workspace — the post update used to run
  // unscoped, so a guessed/known foreign-workspace ruleId could null out that
  // rule's assignment on another workspace's posts even though the rule
  // itself wasn't touched (its own delete was already correctly scoped).
  await db.post.updateMany({ where: { recycleRuleId: id, workspaceId: ctx.active.workspace.id }, data: { recycleRuleId: null } });
  await db.recycleRule.deleteMany({ where: { id, workspaceId: ctx.active.workspace.id } });
  revalidatePath("/recycling");
  return ok(undefined, "Rule deleted");
}

export async function assignPostToRuleAction(postId: string, ruleId: string | null) {
  const ctx = await withPermission("content.edit");
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || post.workspaceId !== ctx.active.workspace.id) return fail("Post not found");
  if (ruleId) {
    const rule = await db.recycleRule.findUnique({ where: { id: ruleId } });
    if (!rule || rule.workspaceId !== ctx.active.workspace.id) return fail("Rule not found");
  }
  await db.post.update({
    where: { id: postId },
    data: { recycleRuleId: ruleId, isEvergreen: ruleId ? true : post.isEvergreen },
  });
  revalidatePath("/recycling");
  return ok(undefined, ruleId ? "Added to recycling" : "Removed from recycling");
}

/* ---------------- Content goals ---------------- */

export async function upsertGoalAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("workspace.manage");
  const metric = String(formData.get("metric"));
  const target = Number(formData.get("target"));
  const period = String(formData.get("period") || "weekly");
  if (!metric || isNaN(target)) return fail("Invalid goal");
  const existing = await db.contentGoal.findFirst({ where: { workspaceId: ctx.active.workspace.id, metric } });
  if (existing) {
    await db.contentGoal.update({ where: { id: existing.id }, data: { target, period } });
  } else {
    await db.contentGoal.create({ data: { workspaceId: ctx.active.workspace.id, metric, target, period } });
  }
  revalidatePath("/analytics");
  revalidatePath("/dashboard");
  return ok(undefined, "Goal saved");
}
