"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/events";
import { withPermission, ensureInWorkspace, ok, fail } from "./_helpers";

const schema = z.object({
  name: z.string().min(2).max(100),
  objective: z.enum(["awareness", "engagement", "leads", "sales", "launch"]),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  color: z.string().optional(),
  goalPosts: z.coerce.number().int().min(0).optional(),
  goalEngagement: z.coerce.number().int().min(0).optional(),
});

export async function createCampaignAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("content.create");
  const parsed = schema.safeParse({
    name: formData.get("name"),
    objective: formData.get("objective") ?? "awareness",
    startDate: formData.get("startDate") || undefined,
    endDate: formData.get("endDate") || undefined,
    color: formData.get("color") || undefined,
    goalPosts: formData.get("goalPosts") || undefined,
    goalEngagement: formData.get("goalEngagement") || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const c = await db.campaign.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      name: parsed.data.name,
      objective: parsed.data.objective,
      color: parsed.data.color ?? "#c22c2c",
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      goalPosts: parsed.data.goalPosts ?? null,
      goalEngagement: parsed.data.goalEngagement ?? null,
    },
  });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "created",
    entityType: "campaign",
    entityId: c.id,
    summary: `Created campaign "${c.name}"`,
  });
  revalidatePath("/campaigns");
  return ok(c.id, "Campaign created");
}

export async function updateCampaignAction(id: string, data: Partial<z.infer<typeof schema>> & { status?: string }) {
  const ctx = await withPermission("content.create");
  await ensureInWorkspace("campaign", id, ctx.active.workspace.id);
  await db.campaign.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name } : {}),
      ...(data.objective ? { objective: data.objective } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.color ? { color: data.color } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
      ...(data.goalPosts !== undefined ? { goalPosts: data.goalPosts } : {}),
    },
  });
  revalidatePath("/campaigns");
  return ok(undefined, "Campaign updated");
}

export async function deleteCampaignAction(id: string) {
  const ctx = await withPermission("content.delete");
  await ensureInWorkspace("campaign", id, ctx.active.workspace.id);
  await db.post.updateMany({ where: { campaignId: id }, data: { campaignId: null } });
  await db.contentIdea.updateMany({ where: { campaignId: id }, data: { campaignId: null } });
  await db.campaign.delete({ where: { id } });
  revalidatePath("/campaigns");
  return ok(undefined, "Campaign deleted");
}
