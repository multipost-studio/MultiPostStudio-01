"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { withPermission, ok, fail } from "./_helpers";

function parseTags(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

export async function listHashtagGroupsAction() {
  const ctx = await withPermission("content.create");
  const rows = await db.hashtagGroup.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    orderBy: { name: "asc" },
  });
  return ok(rows.map((r) => ({ id: r.id, name: r.name, tags: parseTags(r.tags) })));
}

/** Normalize free-typed input ("#foo, bar  baz") into a clean, deduped tag list. */
function normalizeTags(raw: string): string[] {
  const words = raw.split(/[\s,]+/).map((w) => w.replace(/^#/, "").trim()).filter(Boolean);
  return [...new Set(words)];
}

export async function saveHashtagGroupAction(input: { id?: string; name: string; tagsText: string }) {
  const ctx = await withPermission("content.create");
  const name = input.name.trim();
  if (!name) return fail("Name the group");
  const tags = normalizeTags(input.tagsText);
  if (tags.length === 0) return fail("Add at least one hashtag");
  if (tags.length > 100) return fail("Keep it under 100 hashtags per group");

  if (input.id) {
    const owned = await db.hashtagGroup.findFirst({ where: { id: input.id, workspaceId: ctx.active.workspace.id } });
    if (!owned) return fail("Group not found");
    await db.hashtagGroup.update({ where: { id: input.id }, data: { name, tags: JSON.stringify(tags) } });
  } else {
    const dupe = await db.hashtagGroup.findFirst({ where: { workspaceId: ctx.active.workspace.id, name } });
    if (dupe) return fail("A group with that name already exists");
    await db.hashtagGroup.create({ data: { workspaceId: ctx.active.workspace.id, name, tags: JSON.stringify(tags) } });
  }
  revalidatePath("/composer");
  return ok(undefined, "Saved");
}

export async function deleteHashtagGroupAction(id: string) {
  const ctx = await withPermission("content.create");
  const owned = await db.hashtagGroup.findFirst({ where: { id, workspaceId: ctx.active.workspace.id } });
  if (!owned) return fail("Group not found");
  await db.hashtagGroup.delete({ where: { id } });
  revalidatePath("/composer");
  return ok();
}
