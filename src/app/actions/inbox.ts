"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { replyAsync } from "@/lib/adapters/ai";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logActivity } from "@/lib/events";
import { parseJson } from "@/lib/utils";
import { readToken } from "@/lib/social/crypto";
import { blueskyReply } from "@/lib/social/bluesky";
import { logger } from "@/lib/logger";
import { withPermission, ok, fail } from "./_helpers";

/** Post an inbox reply back to the platform. Returns null on success, an error string otherwise. */
async function deliverReply(
  conv: { platform: string; channelId: string; externalId: string },
  text: string,
): Promise<string | null> {
  if (!["bluesky", "facebook", "instagram", "threads"].includes(conv.platform)) return null; // stored-only until wired

  const channel = await db.socialChannel.findUnique({
    where: { id: conv.channelId },
    include: { socialAccount: true },
  });
  const acc = channel?.socialAccount;
  if (!acc) return "Connected account not found";

  if (conv.platform === "bluesky") {
    const jwt = readToken(acc.accessToken);
    const meta = parseJson<{ did?: string; pds?: string }>(acc.metadata, {});
    if (!jwt || !meta.did) return "Bluesky session unavailable — reconnect the account";
    try {
      const posts = await fetch(
        `${meta.pds ?? "https://bsky.social"}/xrpc/app.bsky.feed.getPosts?uris=${encodeURIComponent(conv.externalId)}`,
        { headers: { authorization: `Bearer ${jwt}` } },
      ).then((r) => r.json() as Promise<{ posts?: { uri: string; cid: string }[] }>);
      const parent = posts.posts?.[0];
      if (!parent) return "Original post not found on Bluesky";
      await blueskyReply({ pds: meta.pds, accessJwt: jwt, did: meta.did, text, parentUri: parent.uri, parentCid: parent.cid });
      return null;
    } catch (e) {
      logger.warn({ err: e, conv: conv.externalId }, "bluesky reply delivery failed");
      return e instanceof Error ? e.message : "Reply delivery failed";
    }
  }

  const token = readToken(acc.accessToken);
  if (!token) return "Connected account token unavailable — reconnect";
  const targetId = conv.externalId.split(":").pop();
  if (!targetId) return "Comment reference missing";

  // Threads: 2-step — text container with reply_to_id, then publish.
  if (conv.platform === "threads") {
    const meta = parseJson<{ remoteId?: string }>(acc.metadata, {});
    if (!meta.remoteId) return "Threads account id missing — reconnect";
    try {
      const mk = (path: string, params: Record<string, string>) =>
        fetch(`https://graph.threads.net/v1.0/${path}`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(params),
        }).then(async (r) => {
          const t = await r.text();
          if (!r.ok) throw new Error(`Threads ${r.status}: ${t.slice(0, 200)}`);
          return JSON.parse(t) as { id: string };
        });
      const container = await mk(`${meta.remoteId}/threads`, {
        media_type: "TEXT",
        text,
        reply_to_id: targetId,
        access_token: token,
      });
      await mk(`${meta.remoteId}/threads_publish`, { creation_id: container.id, access_token: token });
      return null;
    } catch (e) {
      logger.warn({ err: e, conv: conv.externalId }, "threads reply delivery failed");
      return e instanceof Error ? e.message : "Reply delivery failed";
    }
  }

  // Meta: externalId is "<platform>:comment:<id>". FB replies to /{id}/comments,
  // IG replies to /{id}/replies.
  const commentId = targetId;
  const path = conv.platform === "instagram" ? `${commentId}/replies` : `${commentId}/comments`;
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${path}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ message: text, access_token: token }),
    });
    if (!res.ok) return `Graph ${res.status}: ${(await res.text()).slice(0, 200)}`;
    return null;
  } catch (e) {
    logger.warn({ err: e, conv: conv.externalId }, "meta reply delivery failed");
    return e instanceof Error ? e.message : "Reply delivery failed";
  }
}

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
  const text = body.trim();
  if (!text) return fail("Reply is empty");

  // Actually post it to the platform (Bluesky today).
  const err = await deliverReply(
    { platform: conv.platform, channelId: conv.channelId, externalId: conv.externalId },
    text,
  );
  if (err) return fail(err);

  await db.message.create({
    data: { conversationId: id, direction: "outbound", authorName: ctx.user.name, body: text },
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
  const posted = ["bluesky", "facebook", "instagram", "threads"].includes(conv.platform);
  return ok(undefined, posted ? "Reply posted" : "Reply saved");
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
