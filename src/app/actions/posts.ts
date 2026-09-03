"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/events";
import { enqueuePublish, cancelPublish, runDueJobs } from "@/lib/adapters/queue";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { nextAvailableSlot } from "@/lib/scheduling";
import { predictPerformance } from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import type { PlatformKey } from "@/lib/constants";
import { withPermission, limitGuard, ensureInWorkspace, snapshotPostVersion, ok, fail } from "./_helpers";

/* ---------------- create ---------------- */

export async function createDraftAction() {
  const ctx = await withPermission("content.create");
  const post = await db.post.create({
    data: { workspaceId: ctx.active.workspace.id, authorId: ctx.user.id, status: "draft" },
  });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "created",
    entityType: "post",
    entityId: post.id,
    summary: "Started a new draft",
  });
  redirect(`/composer/${post.id}`);
}

/* ---------------- save composer ---------------- */

const saveSchema = z.object({
  id: z.string(),
  title: z.string().max(200).optional(),
  firstComment: z.string().max(2000).optional(),
  campaignId: z.string().optional(),
  pillarId: z.string().optional(),
  utmSource: z.string().max(80).optional(),
  utmMedium: z.string().max(80).optional(),
  utmCampaign: z.string().max(120).optional(),
  isEvergreen: z.boolean().optional(),
  channels: z.array(z.object({ channelId: z.string(), body: z.string().max(20000) })),
  mediaIds: z.array(z.string()),
  tagIds: z.array(z.string()),
});

export async function savePostAction(input: z.infer<typeof saveSchema>) {
  const ctx = await withPermission("content.edit");
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid post data");
  const data = parsed.data;
  await ensureInWorkspace("post", data.id, ctx.active.workspace.id);

  const post = await db.post.findUniqueOrThrow({ where: { id: data.id }, include: { channels: true } });
  if (["published", "publishing"].includes(post.status)) return fail("Published posts can't be edited");

  await snapshotPostVersion(data.id, ctx.user.id, "Saved from composer");

  // Resolve channel platform map.
  const wsChannels = await db.socialChannel.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    select: { id: true, platform: true },
  });
  const platformOf = new Map(wsChannels.map((c) => [c.id, c.platform]));

  await db.$transaction(async (tx) => {
    await tx.post.update({
      where: { id: data.id },
      data: {
        title: data.title || null,
        firstComment: data.firstComment || null,
        campaignId: data.campaignId || null,
        pillarId: data.pillarId || null,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        isEvergreen: data.isEvergreen ?? post.isEvergreen,
      },
    });

    // Channels: upsert selected, delete removed.
    const keepIds = new Set(data.channels.map((c) => c.channelId));
    await tx.postChannel.deleteMany({
      where: { postId: data.id, channelId: { notIn: [...keepIds] } },
    });
    for (const c of data.channels) {
      await tx.postChannel.upsert({
        where: { postId_channelId: { postId: data.id, channelId: c.channelId } },
        create: {
          postId: data.id,
          channelId: c.channelId,
          platform: platformOf.get(c.channelId) ?? "x",
          body: c.body,
        },
        update: { body: c.body, platform: platformOf.get(c.channelId) ?? "x" },
      });
    }

    // Media.
    await tx.mediaOnPost.deleteMany({ where: { postId: data.id } });
    for (const [i, mediaId] of data.mediaIds.entries()) {
      await tx.mediaOnPost.create({ data: { postId: data.id, mediaId, order: i } });
    }

    // Tags.
    await tx.tagOnPost.deleteMany({ where: { postId: data.id } });
    for (const tagId of data.tagIds) {
      await tx.tagOnPost.create({ data: { postId: data.id, tagId } });
    }
  });

  revalidatePath(`/composer/${data.id}`);
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok(undefined, "Saved");
}

/* ---------------- prediction ---------------- */

export async function runPredictionAction(postId: string) {
  const ctx = await withPermission("content.edit");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  const post = await db.post.findUniqueOrThrow({
    where: { id: postId },
    include: { channels: true, media: true },
  });
  if (post.channels.length === 0) return fail("Add at least one channel first");

  const primary = post.channels[0];
  const pred = predictPerformance({
    body: primary.body,
    platform: primary.platform as PlatformKey,
    hasMedia: post.media.length > 0,
  });
  await db.postPrediction.upsert({
    where: { postId },
    create: {
      postId,
      engagementScore: pred.engagementScore,
      clarityScore: pred.clarityScore,
      hookStrength: pred.hookStrength,
      readability: pred.readability,
      ctaScore: pred.ctaScore,
      brandVoiceScore: pred.brandVoiceScore,
      platformFitScore: pred.platformFitScore,
      recommendations: JSON.stringify(pred.recommendations),
    },
    update: {
      engagementScore: pred.engagementScore,
      clarityScore: pred.clarityScore,
      hookStrength: pred.hookStrength,
      readability: pred.readability,
      ctaScore: pred.ctaScore,
      brandVoiceScore: pred.brandVoiceScore,
      platformFitScore: pred.platformFitScore,
      recommendations: JSON.stringify(pred.recommendations),
      predictedAt: new Date(),
    },
  });
  await db.post.update({ where: { id: postId }, data: { aiPredictionScore: pred.engagementScore } });
  revalidatePath(`/composer/${postId}`);
  return ok(pred, "Prediction updated");
}

/* ---------------- schedule / queue / publish ---------------- */

async function assertReady(postId: string) {
  const post = await db.post.findUniqueOrThrow({ where: { id: postId }, include: { channels: true } });
  if (post.channels.length === 0) throw new Error("Add at least one channel");
  if (post.channels.some((c) => !c.body.trim())) throw new Error("Every channel needs content");
  return post;
}

export async function schedulePostAction(postId: string, whenISO: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  const when = new Date(whenISO);
  if (isNaN(when.getTime())) return fail("Invalid date/time");
  if (when.getTime() < Date.now() - 60_000) return fail("Pick a time in the future");

  // Plan cap on the number of posts sitting in the schedule at once.
  const current = await db.post.findUnique({ where: { id: postId }, select: { status: true } });
  if (current?.status !== "scheduled") {
    const queued = await db.post.count({ where: { workspace: { orgId: ctx.active.org.id }, status: "scheduled" } });
    const lim = await limitGuard(ctx.active.org.id, "maxScheduled", queued, "scheduled posts");
    if (lim) return lim;
  }

  try {
    await assertReady(postId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Post is not ready");
  }

  await db.post.update({
    where: { id: postId },
    data: { status: "scheduled", scheduledAt: when },
  });
  await db.postChannel.updateMany({ where: { postId }, data: { status: "scheduled", error: null } });
  await enqueuePublish(postId, when);
  await bumpUsage(ctx.active.org.id, "scheduled_posts");
  await dispatchWebhook(ctx.active.org.id, "post.scheduled", { postId, scheduledAt: when.toISOString() });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "scheduled",
    entityType: "post",
    entityId: postId,
    summary: `Scheduled a post for ${when.toLocaleString()}`,
  });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Scheduled");
}

export async function addToQueueAction(postId: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  let post;
  try {
    post = await assertReady(postId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Post is not ready");
  }
  const when = await nextAvailableSlot(
    ctx.active.workspace.id,
    post.channels.map((c) => c.channelId),
  );
  return schedulePostAction(postId, when.toISOString());
}

export async function publishNowAction(postId: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  try {
    await assertReady(postId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Post is not ready");
  }
  await db.post.update({ where: { id: postId }, data: { status: "scheduled", scheduledAt: new Date() } });
  await db.postChannel.updateMany({ where: { postId }, data: { status: "scheduled", error: null } });
  await enqueuePublish(postId, new Date());
  await bumpUsage(ctx.active.org.id, "scheduled_posts");
  await runDueJobs(); // process immediately
  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Publishing now");
}

export async function unscheduleAction(postId: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await cancelPublish(postId);
  await db.post.update({ where: { id: postId }, data: { status: "draft", scheduledAt: null } });
  await db.postChannel.updateMany({ where: { postId }, data: { status: "pending" } });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok(undefined, "Moved back to drafts");
}

export async function rescheduleAction(postId: string, whenISO: string) {
  return schedulePostAction(postId, whenISO);
}

export async function retryPublishAction(postId: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await db.post.update({ where: { id: postId }, data: { status: "scheduled", scheduledAt: new Date() } });
  await db.postChannel.updateMany({ where: { postId }, data: { status: "scheduled", error: null } });
  await enqueuePublish(postId, new Date());
  await runDueJobs();
  revalidatePath("/queue");
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Retrying");
}

export async function duplicatePostAction(postId: string) {
  const ctx = await withPermission("content.create");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  const src = await db.post.findUniqueOrThrow({
    where: { id: postId },
    include: { channels: true, media: true, tags: true },
  });
  const copy = await db.post.create({
    data: {
      workspaceId: src.workspaceId,
      authorId: ctx.user.id,
      title: src.title ? `${src.title} (copy)` : null,
      status: "draft",
      campaignId: src.campaignId,
      pillarId: src.pillarId,
      firstComment: src.firstComment,
      isEvergreen: src.isEvergreen,
      channels: {
        create: src.channels.map((c) => ({ channelId: c.channelId, platform: c.platform, body: c.body })),
      },
      media: { create: src.media.map((m) => ({ mediaId: m.mediaId, order: m.order })) },
      tags: { create: src.tags.map((t) => ({ tagId: t.tagId })) },
    },
  });
  redirect(`/composer/${copy.id}`);
}

export async function archivePostAction(postId: string) {
  const ctx = await withPermission("content.edit");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await cancelPublish(postId);
  await db.post.update({ where: { id: postId }, data: { status: "archived", archivedAt: new Date(), scheduledAt: null } });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok(undefined, "Archived");
}

export async function deletePostAction(postId: string) {
  const ctx = await withPermission("content.delete");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await cancelPublish(postId);
  await db.post.delete({ where: { id: postId } });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  redirect("/calendar");
}

export async function toggleChannelQueueAction(channelId: string, paused: boolean) {
  const ctx = await withPermission("content.publish");
  const ch = await db.socialChannel.findUnique({ where: { id: channelId } });
  if (!ch || ch.workspaceId !== ctx.active.workspace.id) return fail("Channel not found");
  await db.socialChannel.update({ where: { id: channelId }, data: { queuePaused: paused } });
  revalidatePath("/queue");
  return ok();
}

/* ---------------- collaboration ---------------- */

export async function addPostCommentAction(postId: string, body: string) {
  const ctx = await withPermission("content.create");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  if (!body.trim()) return fail("Comment is empty");
  await db.threadComment.create({ data: { postId, authorId: ctx.user.id, body: body.trim() } });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "commented",
    entityType: "post",
    entityId: postId,
    summary: "Commented on a post",
  });
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Comment added");
}

export async function resolveCommentAction(commentId: string) {
  const ctx = await withPermission("content.create");
  const c = await db.threadComment.findUnique({ where: { id: commentId }, include: { post: true } });
  if (!c || c.post.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  await db.threadComment.update({ where: { id: commentId }, data: { resolved: true } });
  revalidatePath(`/composer/${c.postId}`);
  return ok();
}

export async function restoreVersionAction(postId: string, versionId: string) {
  const ctx = await withPermission("content.edit");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  const v = await db.postVersion.findUnique({ where: { id: versionId } });
  if (!v || v.postId !== postId) return fail("Version not found");
  const snap = JSON.parse(v.snapshot) as {
    title?: string;
    firstComment?: string;
    channels?: { channelId: string; platform: string; body: string }[];
  };
  await snapshotPostVersion(postId, ctx.user.id, `Restored v${v.version}`);
  await db.post.update({
    where: { id: postId },
    data: { title: snap.title ?? null, firstComment: snap.firstComment ?? null },
  });
  if (snap.channels) {
    for (const c of snap.channels) {
      await db.postChannel.updateMany({ where: { postId, channelId: c.channelId }, data: { body: c.body } });
    }
  }
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, `Restored version ${v.version}`);
}

/** Move an evergreen post's status flag. */
export async function toggleEvergreenAction(postId: string, value: boolean) {
  const ctx = await withPermission("content.edit");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await db.post.update({ where: { id: postId }, data: { isEvergreen: value } });
  revalidatePath("/recycling");
  revalidatePath(`/composer/${postId}`);
  return ok();
}
