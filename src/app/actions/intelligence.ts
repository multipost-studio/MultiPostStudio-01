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
