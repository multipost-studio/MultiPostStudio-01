"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { withPermission, ok } from "./_helpers";

const KNOWN_TAGS = ["VIP", "Influencer", "Churn risk"] as const;

export async function getContactAction(platform: string, handle: string) {
  const ctx = await withPermission("inbox.respond");
  const wsId = ctx.active.workspace.id;

  const [contact, history] = await Promise.all([
    db.socialContact.findUnique({ where: { workspaceId_platform_handle: { workspaceId: wsId, platform, handle } } }),
    db.conversation.findMany({
      where: { workspaceId: wsId, platform, authorHandle: handle },
      orderBy: { lastMessageAt: "desc" },
      take: 10,
      select: { id: true, preview: true, status: true, lastMessageAt: true },
    }),
  ]);

  return ok({
    tags: contact ? parseJson<string[]>(contact.tags, []) : [],
    notes: contact?.notes ?? "",
    knownTags: KNOWN_TAGS,
    history: history.map((h) => ({ id: h.id, preview: h.preview, status: h.status, lastMessageAt: h.lastMessageAt.toISOString() })),
  });
}

export async function saveContactAction(input: { platform: string; handle: string; displayName?: string; tags: string[]; notes: string }) {
  const ctx = await withPermission("inbox.respond");
  const tags = [...new Set(input.tags.map((t) => t.trim()).filter(Boolean))];
  if (tags.length === 0 && !input.notes.trim()) {
    // Nothing to persist — don't create an empty row for every contact ever opened.
    await db.socialContact
      .delete({
        where: { workspaceId_platform_handle: { workspaceId: ctx.active.workspace.id, platform: input.platform, handle: input.handle } },
      })
      .catch(() => {});
    revalidatePath("/inbox");
    return ok();
  }

  await db.socialContact.upsert({
    where: { workspaceId_platform_handle: { workspaceId: ctx.active.workspace.id, platform: input.platform, handle: input.handle } },
    create: {
      workspaceId: ctx.active.workspace.id,
      platform: input.platform,
      handle: input.handle,
      displayName: input.displayName,
      tags: JSON.stringify(tags),
      notes: input.notes.trim() || null,
    },
    update: { tags: JSON.stringify(tags), notes: input.notes.trim() || null },
  });
  revalidatePath("/inbox");
  return ok(undefined, "Saved");
}
