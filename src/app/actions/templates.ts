"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { PLATFORM_KEYS } from "@/lib/constants";
import { getPresetTemplate } from "@/lib/preset-templates";
import { withPermission, ok, fail } from "./_helpers";

export async function createTemplateAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("content.create");
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") || "general");
  const body = String(formData.get("body") ?? "").trim();
  const platforms = formData.getAll("platforms").map(String).filter((p) => (PLATFORM_KEYS as readonly string[]).includes(p));
  if (!name || !body) return fail("Name and body are required");
  await db.template.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      name,
      category,
      body,
      platforms: JSON.stringify(platforms.length ? platforms : ["instagram"]),
    },
  });
  revalidatePath("/templates");
  return ok(undefined, "Template saved");
}

export async function deleteTemplateAction(id: string) {
  const ctx = await withPermission("content.create");
  await db.template.deleteMany({ where: { id, workspaceId: ctx.active.workspace.id } });
  revalidatePath("/templates");
  return ok(undefined, "Template deleted");
}

async function draftFromTemplate(
  ctx: Awaited<ReturnType<typeof withPermission>>,
  tpl: { name: string; body: string; platforms: string[] },
) {
  const channels = await db.socialChannel.findMany({
    where: { workspaceId: ctx.active.workspace.id, platform: { in: tpl.platforms } },
  });
  const post = await db.post.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      authorId: ctx.user.id,
      title: tpl.name,
      status: "draft",
      channels: {
        create: channels.map((c) => ({ channelId: c.id, platform: c.platform, body: tpl.body })),
      },
    },
  });
  redirect(`/composer/${post.id}`);
}

export async function applyTemplateAction(id: string) {
  const ctx = await withPermission("content.create");
  const tpl = await db.template.findFirst({ where: { id, workspaceId: ctx.active.workspace.id } });
  if (!tpl) return;
  await draftFromTemplate(ctx, { name: tpl.name, body: tpl.body, platforms: JSON.parse(tpl.platforms) });
}

export async function applyPresetTemplateAction(slug: string) {
  const ctx = await withPermission("content.create");
  const tpl = getPresetTemplate(slug);
  if (!tpl) return;
  await draftFromTemplate(ctx, tpl);
}
