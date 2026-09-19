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
      color: parsed.data.color ?? "#6f262c",
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
  // Runtime validation: server actions receive plain JSON, so the TS types
  // above are not enforcement. Allowlist enums mirror the edit form.
  const STATUSES = new Set(["planning", "active", "completed", "archived"]);
  const OBJECTIVES = new Set(["awareness", "engagement", "leads", "sales", "launch"]);
  if (data.status !== undefined && !STATUSES.has(data.status)) return fail("Invalid status");
  if (data.objective !== undefined && !OBJECTIVES.has(data.objective)) return fail("Invalid objective");
  const num = (v: unknown, max: number): number | undefined => {
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > max) return NaN;
    return Math.floor(n);
  };
  const goalPosts = num(data.goalPosts, 100_000);
  const goalEngagement = num(data.goalEngagement, 1_000_000_000);
  if (goalPosts !== undefined && isNaN(goalPosts)) return fail("Invalid posts goal");
  if (goalEngagement !== undefined && isNaN(goalEngagement)) return fail("Invalid engagement goal");
  await db.campaign.update({
    where: { id },
    data: {
      ...(data.name ? { name: data.name.trim().slice(0, 100) } : {}),
      ...(data.objective ? { objective: data.objective } : {}),
      ...(data.status ? { status: data.status } : {}),
      ...(data.color ? { color: String(data.color).slice(0, 32) } : {}),
      ...(data.startDate !== undefined ? { startDate: data.startDate ? new Date(data.startDate) : null } : {}),
      ...(data.endDate !== undefined ? { endDate: data.endDate ? new Date(data.endDate) : null } : {}),
      ...(data.goalPosts !== undefined ? { goalPosts } : {}),
      ...(data.goalEngagement !== undefined ? { goalEngagement } : {}),
    },
  });
  revalidatePath("/campaigns");
  return ok(undefined, "Campaign updated");
}

const resultsSchema = z.object({
  budgetCents: z.coerce.number().int().min(0).max(1_000_000_00).optional(),
  revenueCents: z.coerce.number().int().min(0).max(1_000_000_000).optional(),
  conversions: z.coerce.number().int().min(0).max(10_000_000).optional(),
});

export async function recordCampaignResultsAction(id: string, data: z.infer<typeof resultsSchema>) {
  const ctx = await withPermission("content.create");
  await ensureInWorkspace("campaign", id, ctx.active.workspace.id);
  const parsed = resultsSchema.safeParse(data);
  if (!parsed.success) return fail("Enter valid numbers");
  await db.campaign.update({
    where: { id },
    data: {
      ...(parsed.data.budgetCents !== undefined ? { budgetCents: parsed.data.budgetCents } : {}),
      ...(parsed.data.revenueCents !== undefined ? { revenueCents: parsed.data.revenueCents } : {}),
      ...(parsed.data.conversions !== undefined ? { conversions: parsed.data.conversions } : {}),
    },
  });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "updated",
    entityType: "campaign",
    entityId: id,
    summary: "Recorded campaign results",
  });
  revalidatePath(`/campaigns/${id}`);
  revalidatePath("/campaigns");
  return ok(undefined, "Results saved");
}

export async function deleteCampaignAction(id: string) {
  const ctx = await withPermission("content.delete");
  await ensureInWorkspace("campaign", id, ctx.active.workspace.id);
  // Defense in depth: the updateMany filters below repeat the workspace
  // scope instead of relying solely on the ensureInWorkspace check above —
  // a missing guard must never become a cross-tenant null-out.
  const wsId = ctx.active.workspace.id;
  await db.post.updateMany({ where: { campaignId: id, workspaceId: wsId }, data: { campaignId: null } });
  await db.contentIdea.updateMany({ where: { campaignId: id, workspaceId: wsId }, data: { campaignId: null } });
  await db.campaign.delete({ where: { id } });
  revalidatePath("/campaigns");
  return ok(undefined, "Campaign deleted");
}
