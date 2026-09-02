"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { IDEA_STAGES } from "@/lib/constants";
import { logActivity } from "@/lib/events";
import { withPermission, ensureInWorkspace, ok, fail } from "./_helpers";

const ideaSchema = z.object({
  title: z.string().min(2, "Give the idea a title").max(160),
  notes: z.string().max(4000).optional(),
  kind: z.enum(["text", "link", "image", "video", "voice"]).default("text"),
  url: z.string().url().optional().or(z.literal("")),
  pillarId: z.string().optional(),
  campaignId: z.string().optional(),
});

export async function createIdeaAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("content.create");
  const parsed = ideaSchema.safeParse({
    title: formData.get("title"),
    notes: formData.get("notes") || undefined,
    kind: formData.get("kind") || "text",
    url: formData.get("url") || "",
    pillarId: formData.get("pillarId") || undefined,
    campaignId: formData.get("campaignId") || undefined,
  });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid input");

  const count = await db.contentIdea.count({ where: { workspaceId: ctx.active.workspace.id, stage: "idea" } });
  const idea = await db.contentIdea.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      authorId: ctx.user.id,
      title: parsed.data.title,
      notes: parsed.data.notes,
      kind: parsed.data.kind,
      url: parsed.data.url || null,
      pillarId: parsed.data.pillarId || null,
      campaignId: parsed.data.campaignId || null,
      sortIndex: count,
    },
  });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "created",
    entityType: "idea",
    entityId: idea.id,
    summary: `Added idea "${idea.title}"`,
  });
  revalidatePath("/ideas");
  return ok(idea.id, "Idea added");
}

export async function moveIdeaStageAction(id: string, stage: string, sortIndex: number) {
  const ctx = await withPermission("content.create");
  if (!IDEA_STAGES.includes(stage as (typeof IDEA_STAGES)[number])) return fail("Invalid stage");
  await ensureInWorkspace("contentIdea", id, ctx.active.workspace.id);
  await db.contentIdea.update({ where: { id }, data: { stage, sortIndex } });
  revalidatePath("/ideas");
  return ok();
}

export async function updateIdeaAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("content.create");
  const id = String(formData.get("id"));
  await ensureInWorkspace("contentIdea", id, ctx.active.workspace.id);
  const parsed = ideaSchema.partial().safeParse({
    title: formData.get("title") || undefined,
    notes: formData.get("notes") || undefined,
    pillarId: formData.get("pillarId") || undefined,
    campaignId: formData.get("campaignId") || undefined,
  });
  if (!parsed.success) return fail("Invalid input");
  await db.contentIdea.update({
    where: { id },
    data: {
      ...(parsed.data.title ? { title: parsed.data.title } : {}),
      notes: parsed.data.notes ?? null,
      pillarId: parsed.data.pillarId || null,
      campaignId: parsed.data.campaignId || null,
    },
  });
  revalidatePath("/ideas");
  return ok(undefined, "Idea updated");
}

export async function archiveIdeaAction(id: string) {
  const ctx = await withPermission("content.create");
  await ensureInWorkspace("contentIdea", id, ctx.active.workspace.id);
  await db.contentIdea.update({ where: { id }, data: { archivedAt: new Date() } });
  revalidatePath("/ideas");
  return ok();
}

export async function deleteIdeaAction(id: string) {
  const ctx = await withPermission("content.delete");
  await ensureInWorkspace("contentIdea", id, ctx.active.workspace.id);
  await db.contentIdea.delete({ where: { id } });
  revalidatePath("/ideas");
  return ok();
}

/** Turn an idea into a draft post and open the composer. */
export async function convertIdeaAction(id: string) {
  const ctx = await withPermission("content.create");
  await ensureInWorkspace("contentIdea", id, ctx.active.workspace.id);
  const idea = await db.contentIdea.findUniqueOrThrow({ where: { id }, include: { tags: true } });
  if (idea.stage === "published") return fail("This idea is already published");

  const existing = await db.post.findFirst({ where: { ideaId: id } });
  if (existing) redirect(`/composer/${existing.id}`);

  const post = await db.post.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      authorId: ctx.user.id,
      ideaId: id,
      campaignId: idea.campaignId,
      pillarId: idea.pillarId,
      title: idea.title,
      status: "draft",
      channels: { create: [] },
    },
  });
  for (const t of idea.tags) {
    await db.tagOnPost.create({ data: { postId: post.id, tagId: t.tagId } });
  }
  await db.contentIdea.update({ where: { id }, data: { stage: "drafting" } });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "created",
    entityType: "post",
    entityId: post.id,
    summary: `Converted idea "${idea.title}" to a draft`,
  });
  redirect(`/composer/${post.id}`);
}
