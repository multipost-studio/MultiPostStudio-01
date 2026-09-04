"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { generateInsights } from "@/lib/adapters/ai";
import { fetchTrends } from "@/lib/adapters/trends";
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

export async function regenerateInsightsAction() {
  const ctx = await withPermission("analytics.view");
  const wsId = ctx.active.workspace.id;
  const [snapFirst, snapLast, topFormatRow] = await Promise.all([
    db.metricSnapshot.findFirst({ where: { workspaceId: wsId, channelId: null }, orderBy: { date: "asc" } }),
    db.metricSnapshot.findFirst({ where: { workspaceId: wsId, channelId: null }, orderBy: { date: "desc" } }),
    db.post.groupBy({
      by: ["pillarId"],
      where: { workspaceId: wsId, status: "published", pillarId: { not: null } },
      _count: true,
      orderBy: { _count: { pillarId: "desc" } },
      take: 1,
    }),
  ]);
  const growth =
    snapFirst && snapLast && snapFirst.followers
      ? ((snapLast.followers - snapFirst.followers) / snapFirst.followers) * 100
      : 0;
  const pillar = topFormatRow[0]?.pillarId
    ? await db.contentPillar.findUnique({ where: { id: topFormatRow[0].pillarId } })
    : null;

  const items = generateInsights({
    workspaceName: ctx.active.workspace.name,
    topFormat: pillar?.name.toLowerCase() ?? "educational carousel",
    bestHour: 19,
    growthTrend: Number(growth.toFixed(1)),
  });
  await db.insight.deleteMany({ where: { workspaceId: wsId, dismissed: false } });
  for (const x of items) {
    await db.insight.create({ data: { workspaceId: wsId, ...x } });
  }
  revalidatePath("/insights");
  revalidatePath("/dashboard");
  return ok(undefined, "Insights refreshed");
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
  await db.post.updateMany({ where: { recycleRuleId: id }, data: { recycleRuleId: null } });
  await db.recycleRule.deleteMany({ where: { id, workspaceId: ctx.active.workspace.id } });
  revalidatePath("/recycling");
  return ok(undefined, "Rule deleted");
}

export async function assignPostToRuleAction(postId: string, ruleId: string | null) {
  const ctx = await withPermission("content.edit");
  const post = await db.post.findUnique({ where: { id: postId } });
  if (!post || post.workspaceId !== ctx.active.workspace.id) return fail("Post not found");
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
