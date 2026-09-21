"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { withPermission, featureGuard, ok, fail } from "./_helpers";

const num = (v: FormDataEntryValue | null) => {
  const n = Number(String(v ?? "").trim());
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

const compSchema = z.object({
  name: z.string().min(2).max(80),
  handle: z.string().min(2).max(60),
  platform: z.string().min(2),
});

export async function addCompetitorAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("analytics.view");
  const off = await featureGuard("competitor_intel", "Competitor intelligence");
  if (off) return off;
  const parsed = compSchema.safeParse({
    name: formData.get("name"),
    handle: String(formData.get("handle") ?? "").replace(/^@/, ""),
    platform: formData.get("platform") ?? "instagram",
  });
  if (!parsed.success) return fail("Check the competitor details");

  // All figures come from the user (from the competitor's public profile).
  // Nothing is estimated or fabricated.
  await db.competitor.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      name: parsed.data.name,
      handle: `@${parsed.data.handle}`,
      platform: parsed.data.platform,
      followerCount: Math.round(num(formData.get("followerCount"))),
      postsPerWeek: num(formData.get("postsPerWeek")),
      avgEngagement: num(formData.get("avgEngagement")),
      aiSummary: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  revalidatePath("/competitors");
  return ok(undefined, "Competitor added");
}

export async function removeCompetitorAction(id: string) {
  const ctx = await withPermission("analytics.view");
  await db.competitor.deleteMany({ where: { id, workspaceId: ctx.active.workspace.id } });
  revalidatePath("/competitors");
  return ok(undefined, "Removed");
}

import { getAnalytics } from "@/lib/analytics";
import { generateGapAnalysis } from "@/lib/competitor-intelligence";

export async function aiCompetitorGapAnalysisAction(id: string) {
  const ctx = await withPermission("analytics.view");
  const off = await featureGuard("competitor_intel", "Competitor intelligence");
  if (off) return off;

  const comp = await db.competitor.findFirst({
    where: { id, workspaceId: ctx.active.workspace.id },
    include: { posts: true },
  });
  if (!comp) return fail("Competitor not found");

  const [channels, a] = await Promise.all([
    db.socialChannel.findMany({
      where: { workspaceId: ctx.active.workspace.id },
      select: { followerCount: true },
    }),
    getAnalytics(ctx.active.workspace.id, 30),
  ]);

  const myFollowers = channels.reduce((sum, c) => sum + c.followerCount, 0);
  const myEr = a.engagementRate;
  const myPostsPerWeek = a.postCount / (30 / 7);

  const analysis = generateGapAnalysis({
    myFollowers,
    myPostsPerWeek,
    myEr,
    competitor: {
      name: comp.name,
      followerCount: comp.followerCount,
      postsPerWeek: comp.postsPerWeek,
      avgEngagement: comp.avgEngagement,
      posts: comp.posts,
    },
  });

  const formattedSummary = `${analysis.summary}\n\nOpportunities:\n• ${analysis.opportunities.join("\n• ")}\n\nThreats:\n• ${analysis.threats.join("\n• ")}\n\nRecommendation:\n${analysis.recommendedAction}`;

  await db.competitor.update({
    where: { id },
    data: { aiSummary: formattedSummary },
  });

  revalidatePath("/competitors");
  return ok(analysis, "Gap analysis generated");
}

const postSchema = z.object({
  competitorId: z.string().min(1),
  caption: z.string().min(1).max(1000),
  format: z.string().default("image"),
  engagement: z.number().nonnegative().default(0),
});

export async function addCompetitorPostAction(input: {
  competitorId: string;
  caption: string;
  format?: string;
  engagement?: number;
}) {
  const ctx = await withPermission("analytics.view");
  const comp = await db.competitor.findFirst({
    where: { id: input.competitorId, workspaceId: ctx.active.workspace.id },
  });
  if (!comp) return fail("Competitor not found");

  const parsed = postSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid post data");

  await db.competitorPost.create({
    data: {
      competitorId: comp.id,
      caption: parsed.data.caption,
      format: parsed.data.format,
      engagement: parsed.data.engagement,
      postedAt: new Date(),
    },
  });

  revalidatePath("/competitors");
  return ok(undefined, "Post added");
}

