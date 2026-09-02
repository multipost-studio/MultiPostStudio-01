"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { replyAsync } from "@/lib/adapters/ai";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logActivity } from "@/lib/events";
import { withPermission, ok, fail } from "./_helpers";

async function ownConversation(id: string, workspaceId: string) {
  const c = await db.conversation.findUnique({ where: { id } });
  if (!c || c.workspaceId !== workspaceId) throw new Error("Conversation not found");
  return c;
}

export async function setConversationStatusAction(id: string, status: string) {
  const ctx = await withPermission("inbox.respond");
  await ownConversation(id, ctx.active.workspace.id);
  await db.conversation.update({ where: { id }, data: { status } });
  revalidatePath("/inbox");
  return ok();
}

export async function assignConversationAction(id: string, userId: string | null) {
  const ctx = await withPermission("inbox.assign");
  await ownConversation(id, ctx.active.workspace.id);
  await db.conversation.update({ where: { id }, data: { assigneeId: userId } });
  revalidatePath("/inbox");
  return ok();
}

export async function setConversationLabelsAction(id: string, labels: string[]) {
  const ctx = await withPermission("inbox.respond");
  await ownConversation(id, ctx.active.workspace.id);
  await db.conversation.update({ where: { id }, data: { labels: JSON.stringify(labels) } });
  revalidatePath("/inbox");
  return ok();
}

export async function replyConversationAction(id: string, body: string) {
  const ctx = await withPermission("inbox.respond");
  const conv = await ownConversation(id, ctx.active.workspace.id);
  if (!body.trim()) return fail("Reply is empty");
  await db.message.create({
    data: { conversationId: id, direction: "outbound", authorName: ctx.user.name, body: body.trim() },
  });
  await db.conversation.update({ where: { id }, data: { status: "done", lastMessageAt: new Date() } });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "replied",
    entityType: "conversation",
    entityId: id,
    summary: `Replied to ${conv.authorName}`,
  });
  revalidatePath("/inbox");
  return ok(undefined, "Reply sent");
}

export async function addConversationNoteAction(id: string, body: string) {
  const ctx = await withPermission("inbox.respond");
  await ownConversation(id, ctx.active.workspace.id);
  if (!body.trim()) return fail("Note is empty");
  await db.message.create({
    data: { conversationId: id, direction: "note", authorName: ctx.user.name, body: body.trim() },
  });
  revalidatePath("/inbox");
  return ok(undefined, "Note added");
}

export async function aiReplyAction(id: string, mode: "draft" | "shorter" | "professional" | "brand") {
  const ctx = await withPermission("inbox.respond");
  try {
    await enforceRateLimit(`ai:${ctx.user.id}`, 20, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
  const conv = await ownConversation(id, ctx.active.workspace.id);
  const ws = await db.workspace.findUnique({ where: { id: ctx.active.workspace.id } });
  const lastInbound = await db.message.findFirst({
    where: { conversationId: id, direction: "inbound" },
    orderBy: { createdAt: "desc" },
  });
  const text = await replyAsync({
    message: lastInbound?.body ?? conv.preview,
    mode,
    brand: { name: ws?.name, voice: ws?.brandVoice },
  });
  return ok(text);
}

export async function createSavedReplyAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("inbox.respond");
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return fail("Title and body required");
  await db.savedReply.create({ data: { workspaceId: ctx.active.workspace.id, title, body } });
  revalidatePath("/inbox");
  return ok(undefined, "Saved reply added");
}

export async function deleteSavedReplyAction(id: string) {
  const ctx = await withPermission("inbox.respond");
  await db.savedReply.deleteMany({ where: { id, workspaceId: ctx.active.workspace.id } });
  revalidatePath("/inbox");
  return ok();
}
