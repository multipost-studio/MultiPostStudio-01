"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { logActivity, notifyMentions } from "@/lib/events";
import { enqueuePublish, cancelPublish, runDueJobs } from "@/lib/adapters/queue";
import { dispatchWebhook } from "@/lib/adapters/webhooks";
import { nextAvailableSlot } from "@/lib/scheduling";
import { scorePost } from "@/lib/scoring";
import { bumpUsage } from "@/lib/adapters/billing";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";
import { withPermission, limitGuard, entitlementGuard, ensureInWorkspace, snapshotPostVersion, ok, fail } from "./_helpers";
import { planLimit } from "@/lib/entitlements";

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
  const pred = await scorePost(ctx.active.workspace.id, {
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

/* ---------------- recurring ---------------- */

export type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly";
  interval: number; // every N units
  occurrences: number; // total posts including the first
};

function addRecurrence(base: Date, rule: RecurrenceRule, step: number): Date {
  const d = new Date(base);
  const n = rule.interval * step;
  if (rule.freq === "daily") d.setDate(d.getDate() + n);
  else if (rule.freq === "weekly") d.setDate(d.getDate() + n * 7);
  else d.setMonth(d.getMonth() + n);
  return d;
}

/**
 * Schedule `post` at `whenISO`, then create + schedule (occurrences - 1) copies
 * at fixed intervals. Requires the `recurring_posts` entitlement. Stops early
 * (and reports) if the plan's maxScheduled cap is hit.
 */
export async function scheduleRecurringAction(postId: string, whenISO: string, rule: RecurrenceRule) {
  const ctx = await withPermission("content.publish");
  const orgId = ctx.active.org.id;
  const wsId = ctx.active.workspace.id;
  await ensureInWorkspace("post", postId, wsId);

  const ent = await entitlementGuard(orgId, "recurring_posts", "Recurring posts");
  if (ent) return ent;

  const first = new Date(whenISO);
  if (isNaN(first.getTime())) return fail("Invalid date/time");
  if (first.getTime() < Date.now() - 60_000) return fail("Pick a time in the future");
  const interval = Math.max(1, Math.min(30, Math.round(rule.interval)));
  const occurrences = Math.max(2, Math.min(52, Math.round(rule.occurrences)));
  if (!["daily", "weekly", "monthly"].includes(rule.freq)) return fail("Bad recurrence");

  try {
    await assertReady(postId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Post is not ready");
  }

  const src = await db.post.findUniqueOrThrow({
    where: { id: postId },
    include: { channels: true, media: true, tags: true },
  });

  const limit = await planLimit(orgId, "maxScheduled");
  let queued = await db.post.count({ where: { workspace: { orgId }, status: "scheduled" } });

  const clean = { freq: rule.freq, interval, occurrences };
  let made = 0;

  // Occurrence 1 — the original post.
  if (limit <= 0 || queued < limit) {
    await db.post.update({ where: { id: postId }, data: { status: "scheduled", scheduledAt: first, recurrence: JSON.stringify(clean) } });
    await db.postChannel.updateMany({ where: { postId }, data: { status: "scheduled", error: null } });
    await enqueuePublish(postId, first);
    queued++;
    made++;
  } else {
    return fail(`Your plan allows ${limit} scheduled posts and you're already at ${limit}.`);
  }

  // Occurrences 2..N — copies.
  for (let step = 1; step < occurrences; step++) {
    if (limit > 0 && queued >= limit) break;
    const when = addRecurrence(first, clean, step);
    const copy = await db.post.create({
      data: {
        workspaceId: wsId,
        authorId: ctx.user.id,
        title: src.title,
        status: "scheduled",
        scheduledAt: when,
        campaignId: src.campaignId,
        pillarId: src.pillarId,
        firstComment: src.firstComment,
        isEvergreen: src.isEvergreen,
        recurrence: JSON.stringify({ ...clean, of: postId }),
        channels: { create: src.channels.map((c) => ({ channelId: c.channelId, platform: c.platform, body: c.body, status: "scheduled" })) },
        media: { create: src.media.map((m) => ({ mediaId: m.mediaId, order: m.order })) },
        tags: { create: src.tags.map((t) => ({ tagId: t.tagId })) },
      },
    });
    await enqueuePublish(copy.id, when);
    queued++;
    made++;
  }

  await bumpUsage(orgId, "scheduled_posts", made);
  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath(`/composer/${postId}`);
  return ok(
    { scheduled: made },
    made < occurrences
      ? `Scheduled ${made} of ${occurrences} — plan limit reached, upgrade for the rest`
      : `Scheduled ${made} posts, every ${interval} ${rule.freq === "daily" ? "day(s)" : rule.freq === "weekly" ? "week(s)" : "month(s)"}`,
  );
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
  await notifyMentions({
    workspaceId: ctx.active.workspace.id,
    text: body,
    authorId: ctx.user.id,
    title: `${ctx.user.name} mentioned you`,
    body: body.trim().slice(0, 240),
    linkUrl: `/composer/${postId}`,
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

/** Cancel the still-scheduled future posts of a recurring series. Keeps this post. */
export async function cancelRecurringSeriesAction(postId: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  const self = await db.post.findUniqueOrThrow({ where: { id: postId }, select: { recurrence: true } });
  let originId = postId;
  try {
    const parsed = self.recurrence ? (JSON.parse(self.recurrence) as { of?: string }) : null;
    if (parsed?.of) originId = parsed.of;
  } catch {
    /* ignore */
  }

  const members = await db.post.findMany({
    where: {
      workspaceId: ctx.active.workspace.id,
      status: "scheduled",
      scheduledAt: { gt: new Date() },
      id: { not: postId },
      OR: [{ id: originId }, { recurrence: { contains: `"of":"${originId}"` } }],
    },
    select: { id: true },
  });

  for (const m of members) {
    await cancelPublish(m.id);
    await db.post.delete({ where: { id: m.id } });
  }
  await db.post.update({ where: { id: postId }, data: { recurrence: null } });

  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath(`/composer/${postId}`);
  return ok({ removed: members.length }, `Cancelled ${members.length} upcoming post${members.length === 1 ? "" : "s"} in the series`);
}

/* ---------------- bulk ---------------- */

/**
 * CSV bulk import. One post per row. Columns (header optional, order-flexible):
 *   when, platform, body, title
 * `when` is any Date-parseable string; blank/past leaves the post as a draft.
 * Requires the `csv_import` plan entitlement; scheduled rows respect maxScheduled.
 */
export async function bulkImportPostsAction(csvText: string) {
  const ctx = await withPermission("content.create");
  const orgId = ctx.active.org.id;
  const wsId = ctx.active.workspace.id;
  const ent = await entitlementGuard(orgId, "csv_import", "CSV import");
  if (ent) return ent;

  const rows = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (rows.length === 0) return fail("Nothing to import");

  const split = (line: string) => {
    const out: string[] = [];
    let cur = "", q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === ",") { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  let cols = ["when", "platform", "body", "title"];
  const first = split(rows[0]).map((s) => s.toLowerCase());
  if (first.some((c) => ["when", "date", "platform", "body", "caption", "text"].includes(c))) {
    cols = first.map((c) => (c === "date" ? "when" : c === "caption" || c === "text" ? "body" : c));
    rows.shift();
  }

  const channels = await db.socialChannel.findMany({ where: { workspaceId: wsId } });
  const byPlatform = new Map<string, string>();
  for (const c of channels) if (!byPlatform.has(c.platform)) byPlatform.set(c.platform, c.id);

  let scheduledCount = await db.post.count({ where: { workspace: { orgId }, status: "scheduled" } });
  const schedLimit = await planLimit(orgId, "maxScheduled");

  let created = 0, scheduled = 0, drafts = 0;
  const errors: string[] = [];

  for (const line of rows.slice(0, 500)) {
    const parts = split(line);
    const rec: Record<string, string> = {};
    cols.forEach((c, i) => (rec[c] = parts[i] ?? ""));
    const platform = rec.platform?.toLowerCase();
    const body = rec.body ?? "";
    if (!platform || !PLATFORMS[platform as PlatformKey]) { errors.push(`Unknown platform: "${rec.platform}"`); continue; }
    if (!body.trim()) { errors.push("Empty body — row skipped"); continue; }
    const channelId = byPlatform.get(platform);
    if (!channelId) { errors.push(`No connected ${platform} channel`); continue; }

    const when = rec.when ? new Date(rec.when) : null;
    const validFuture = when && !isNaN(when.getTime()) && when.getTime() > Date.now();
    const canSchedule = validFuture && (schedLimit <= 0 || scheduledCount < schedLimit);

    const post = await db.post.create({
      data: {
        workspaceId: wsId,
        authorId: ctx.user.id,
        title: rec.title?.slice(0, 200) || body.split("\n")[0]?.slice(0, 80) || null,
        status: canSchedule ? "scheduled" : "draft",
        scheduledAt: canSchedule ? when : null,
        channels: { create: [{ channelId, platform, body, status: canSchedule ? "scheduled" : "pending" }] },
      },
    });
    created++;
    if (canSchedule && when) {
      await enqueuePublish(post.id, when);
      scheduledCount++;
      scheduled++;
    } else {
      drafts++;
      if (validFuture) errors.push("Schedule limit reached — imported as draft");
    }
  }

  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath("/composer");
  return ok(
    { created, scheduled, drafts },
    `Imported ${created} post${created === 1 ? "" : "s"} — ${scheduled} scheduled, ${drafts} draft${drafts === 1 ? "" : "s"}${errors.length ? `, ${errors.length} issue(s)` : ""}`,
  );
}

async function forEachOwned(ids: string[], workspaceId: string, fn: (id: string) => Promise<void>) {
  const owned = await db.post.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true } });
  let n = 0;
  for (const { id } of owned) { await fn(id); n++; }
  return n;
}

export async function bulkDeletePostsAction(ids: string[]) {
  const ctx = await withPermission("content.delete");
  const n = await forEachOwned(ids, ctx.active.workspace.id, async (id) => {
    await cancelPublish(id);
    await db.post.delete({ where: { id } });
  });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok({ n }, `Deleted ${n} post${n === 1 ? "" : "s"}`);
}

export async function bulkUnschedulePostsAction(ids: string[]) {
  const ctx = await withPermission("content.publish");
  const n = await forEachOwned(ids, ctx.active.workspace.id, async (id) => {
    await cancelPublish(id);
    await db.post.update({ where: { id }, data: { status: "draft", scheduledAt: null } });
    await db.postChannel.updateMany({ where: { postId: id }, data: { status: "pending" } });
  });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok({ n }, `Moved ${n} post${n === 1 ? "" : "s"} back to draft`);
}

export async function bulkDuplicatePostsAction(ids: string[]) {
  const ctx = await withPermission("content.create");
  const owned = await db.post.findMany({
    where: { id: { in: ids }, workspaceId: ctx.active.workspace.id },
    include: { channels: true, media: true, tags: true },
  });
  for (const src of owned) {
    await db.post.create({
      data: {
        workspaceId: src.workspaceId,
        authorId: ctx.user.id,
        title: src.title ? `${src.title} (copy)` : null,
        status: "draft",
        campaignId: src.campaignId,
        pillarId: src.pillarId,
        firstComment: src.firstComment,
        isEvergreen: src.isEvergreen,
        channels: { create: src.channels.map((c) => ({ channelId: c.channelId, platform: c.platform, body: c.body })) },
        media: { create: src.media.map((m) => ({ mediaId: m.mediaId, order: m.order })) },
        tags: { create: src.tags.map((t) => ({ tagId: t.tagId })) },
      },
    });
  }
  revalidatePath("/composer");
  revalidatePath("/calendar");
  return ok({ n: owned.length }, `Duplicated ${owned.length} post${owned.length === 1 ? "" : "s"} as drafts`);
}
