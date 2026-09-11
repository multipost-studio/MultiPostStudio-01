"use server";

import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace, ok } from "./_helpers";

/** Rows older than this are treated as gone, not deleted proactively. */
const STALE_MS = 20_000;

export async function heartbeatPresenceAction(conversationId: string, isTyping: boolean) {
  const ctx = await withPermission("inbox.respond");
  await ensureInWorkspace("conversation", conversationId, ctx.active.workspace.id);
  await db.conversationPresence.upsert({
    where: { conversationId_userId: { conversationId, userId: ctx.user.id } },
    create: { conversationId, userId: ctx.user.id, isTyping },
    update: { isTyping, updatedAt: new Date() },
  });
  return ok();
}

export async function getPresenceAction(conversationId: string) {
  const ctx = await withPermission("inbox.respond");
  await ensureInWorkspace("conversation", conversationId, ctx.active.workspace.id);
  const rows = await db.conversationPresence.findMany({
    where: {
      conversationId,
      userId: { not: ctx.user.id },
      updatedAt: { gte: new Date(Date.now() - STALE_MS) },
    },
    include: { user: { select: { name: true } } },
  });
  return ok(rows.map((r) => ({ name: r.user.name, isTyping: r.isTyping })));
}
