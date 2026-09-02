"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { seededRandom } from "@/lib/utils";
import { withPermission, ok, fail } from "./_helpers";

const compSchema = z.object({
  name: z.string().min(2).max(80),
  handle: z.string().min(2).max(60),
  platform: z.string().min(2),
});

export async function addCompetitorAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("analytics.view");
  const parsed = compSchema.safeParse({
    name: formData.get("name"),
    handle: String(formData.get("handle") ?? "").replace(/^@/, ""),
    platform: formData.get("platform") ?? "instagram",
  });
  if (!parsed.success) return fail("Check the competitor details");

  const seed = parsed.data.handle;
  await db.competitor.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      name: parsed.data.name,
      handle: `@${parsed.data.handle}`,
      platform: parsed.data.platform,
      followerCount: 5000 + Math.floor(seededRandom(seed) * 80000),
      postsPerWeek: Number((3 + seededRandom(seed + "p") * 6).toFixed(1)),
      avgEngagement: Number((1 + seededRandom(seed + "e") * 4).toFixed(2)),
      aiSummary: `${parsed.data.name} publishes mostly ${["carousels", "reels", "single images"][seed.length % 3]}, heaviest mid-week. Educational content outperforms product posts by a wide margin.`,
      posts: {
        create: Array.from({ length: 4 }, (_, i) => ({
          format: ["carousel", "reel", "image", "carousel"][i],
          caption: `${parsed.data.name} recent post ${i + 1}`,
          engagement: 200 + Math.floor(seededRandom(seed + i) * 3000),
          postedAt: new Date(Date.now() - (i + 1) * 3 * 86_400_000),
        })),
      },
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
