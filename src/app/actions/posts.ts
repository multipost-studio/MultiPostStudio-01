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
import { bumpUsage, debumpUsage } from "@/lib/adapters/billing";
import { PLATFORMS, type PlatformKey } from "@/lib/constants";
import { normalizeContentType, validateChannel } from "@/lib/social/capabilities";
import { withPermission, limitGuard, entitlementGuard, featureGuard, ensureInWorkspace, snapshotPostVersion, scopedCampaignRefs, ok, fail } from "./_helpers";
import { planLimit } from "@/lib/entitlements";
import { parseComplianceRules, lintCompliance } from "@/lib/compliance";

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
  channels: z.array(
    z.object({
      channelId: z.string(),
      body: z.string().max(200000),
      contentType: z.string().max(32).optional(),
    }),
  ),
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

  // Editing a post that is out for approval — or already signed off — pulls it
  // back to draft and closes the open approval requests. Otherwise an author
  // could get benign copy approved and then rewrite it before it publishes,
  // with the sign-off still attached.
  const wasInApproval = post.status === "awaiting_approval" || post.status === "approved";
  if (wasInApproval) {
    await db.approvalRequest.updateMany({
      where: { postId: data.id, status: { in: ["in_review", "changes_requested"] } },
      data: { status: "rejected" },
    });
  }

  await snapshotPostVersion(data.id, ctx.user.id, "Saved from composer");

  // Resolve channel platform map — also the workspace-ownership check: any
  // channelId not in here belongs to another workspace (or doesn't exist) and
  // must be dropped, never upserted. A client-supplied foreign channelId would
  // otherwise let a post publish through another workspace's connected social
  // account (their real, live OAuth token) once the queue processes it.
  const wsChannels = await db.socialChannel.findMany({
    where: { workspaceId: ctx.active.workspace.id },
    select: { id: true, platform: true },
  });
  const platformOf = new Map(wsChannels.map((c) => [c.id, c.platform]));
  const channels = data.channels.filter((c) => platformOf.has(c.channelId));

  // Same ownership check for media/tags — a foreign id here can't reach
  // another workspace's OAuth credentials, but it would let one workspace
  // attach (and publish) another's private media asset, and would trip the
  // "in use by N posts" guard for the real owner trying to delete it.
  const [wsMedia, wsTags] = await Promise.all([
    db.mediaAsset.findMany({ where: { workspaceId: ctx.active.workspace.id, id: { in: data.mediaIds } }, select: { id: true } }),
    db.tag.findMany({ where: { workspaceId: ctx.active.workspace.id, id: { in: data.tagIds } }, select: { id: true } }),
  ]);
  const validMediaIds = new Set(wsMedia.map((m) => m.id));
  const validTagIds = new Set(wsTags.map((t) => t.id));
  // Filter (not re-order from the DB result) so the client's chosen media order is kept.
  const mediaIds = data.mediaIds.filter((id) => validMediaIds.has(id));
  const tagIds = data.tagIds.filter((id) => validTagIds.has(id));

  // Campaigns/pillars get the same ownership rule: attaching a foreign id
  // would pollute another workspace's campaign analytics and let a delete
  // over there null out this post's reference. Drop to null, don't trust.
  const scopedRefs = await scopedCampaignRefs(ctx.active.workspace.id, data.campaignId, data.pillarId);

  // X thread resume state references already-posted parts by position. If the
  // X body changed since, resuming would continue mid-thread with new text —
  // replies landing on old tweets, edited openers dropped. Snapshot previous
  // bodies so the upsert below can clear stale resume state on change only
  // (unchanged bodies keep resume working for legitimate retries).
  const prevBodies = new Map(
    (
      await db.postChannel.findMany({
        where: { postId: data.id, platform: "x" },
        select: { channelId: true, body: true },
      })
    ).map((c) => [c.channelId, c.body] as const),
  );

  await db.$transaction(async (tx) => {
    await tx.post.update({      where: { id: data.id },
      data: {
        title: data.title || null,
        firstComment: data.firstComment || null,
        campaignId: scopedRefs.campaignId,
        pillarId: scopedRefs.pillarId,
        utmSource: data.utmSource || null,
        utmMedium: data.utmMedium || null,
        utmCampaign: data.utmCampaign || null,
        isEvergreen: data.isEvergreen ?? post.isEvergreen,
        // See the wasInApproval note above — an edit recalls the post.
        ...(wasInApproval ? { status: "draft" } : {}),
      },
    });

    // Channels: upsert selected, delete removed.
    const keepIds = new Set(channels.map((c) => c.channelId));
    await tx.postChannel.deleteMany({
      where: { postId: data.id, channelId: { notIn: [...keepIds] } },
    });
    for (const c of channels) {
      const platform = platformOf.get(c.channelId)!; // always resolves — `channels` is pre-filtered to known ids
      const contentType = normalizeContentType(platform, c.contentType);
      await tx.postChannel.upsert({
        where: { postId_channelId: { postId: data.id, channelId: c.channelId } },
        create: { postId: data.id, channelId: c.channelId, platform, contentType, body: c.body },
        update: {
          body: c.body,
          platform,
          contentType,
          // Clear stale X resume state when the body changed (see above).
          ...(platform === "x" && prevBodies.get(c.channelId) !== c.body ? { retryState: null } : {}),
        },
      });
    }

    // Media.
    await tx.mediaOnPost.deleteMany({ where: { postId: data.id } });
    for (const [i, mediaId] of mediaIds.entries()) {
      await tx.mediaOnPost.create({ data: { postId: data.id, mediaId, order: i } });
    }

    // Tags.
    await tx.tagOnPost.deleteMany({ where: { postId: data.id } });
    for (const tagId of tagIds) {
      await tx.tagOnPost.create({ data: { postId: data.id, tagId } });
    }
  });

  revalidatePath(`/composer/${data.id}`);
  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath("/approvals");
  return ok(
    undefined,
    wasInApproval ? "Saved as draft — the approval was reset because the post changed" : "Saved",
  );
}

/* ---------------- prediction ---------------- */

export async function runPredictionAction(postId: string) {
  const ctx = await withPermission("content.edit");
  const off = await featureGuard("predictive_scoring", "Predictive scoring");
  if (off) return off;
  // ai_content_score is a Pro-tier entitlement — the platform flag above is a
  // kill switch, not a plan check.
  const notEntitled = await entitlementGuard(ctx.active.org.id, "ai_content_score", "Post scoring");
  if (notEntitled) return notEntitled;
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
  // Egress: validation reads only the columns it checks (channel bodies +
  // media dimensions + compliance rules) — never full post/channel/media rows.
  // This runs per publish AND per bulk-imported row, so the saving multiplies.
  const post = await db.post.findUniqueOrThrow({
    where: { id: postId },
    select: {
      workspaceId: true,
      channels: {
        select: {
          channelId: true,
          platform: true,
          contentType: true,
          body: true,
          channel: { select: { name: true } },
        },
      },
      media: {
        orderBy: { order: "asc" },
        select: {
          media: { select: { kind: true, mimeType: true, width: true, height: true, durationSec: true } },
        },
      },
    },
  });
  if (post.channels.length === 0) throw new Error("Add at least one channel");
  if (post.channels.some((c) => !c.body.trim())) throw new Error("Every channel needs content");

  // Platform + content-type validation from the central capability layer.
  const mediaInputs = post.media.map((m) => ({
    kind: m.media.kind,
    mimeType: m.media.mimeType,
    width: m.media.width,
    height: m.media.height,
    durationSec: m.media.durationSec,
  }));
  const problems: string[] = [];
  for (const pc of post.channels) {
    const { errors } = validateChannel(pc.platform, pc.contentType, { body: pc.body, media: mediaInputs });
    const name = pc.channel?.name ?? pc.platform;
    for (const e of errors) problems.push(`${name}: ${e}`);
  }

  // Regulatory keyword compliance gate — opt-in per workspace via
  // /settings/workspace. Empty ruleset (the default) is a no-op.
  const ws = await db.workspace.findUnique({ where: { id: post.workspaceId }, select: { complianceRules: true } });
  const rules = parseComplianceRules(ws?.complianceRules ?? null);
  if (rules.forbiddenWords.length > 0 || rules.disclaimerTriggers.length > 0) {
    for (const pc of post.channels) {
      const name = pc.channel?.name ?? pc.platform;
      for (const p of lintCompliance(pc.body, rules)) problems.push(`${name}: ${p}`);
    }
  }

  if (problems.length) throw new Error(problems.join("\n"));

  return post;
}

export async function schedulePostAction(postId: string, whenISO: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  const when = new Date(whenISO);
  if (isNaN(when.getTime())) return fail("Invalid date/time");
  if (when.getTime() < Date.now() - 60_000) return fail("Pick a time in the future");

  // Never re-arm channels that already published: rescheduling a live or
  // partially-live post used to flip every channel back to "scheduled",
  // double-posting the published ones on the next tick.
  const live = await db.postChannel.count({ where: { postId, status: "published" } });
  if (live > 0) {
    const total = await db.postChannel.count({ where: { postId } });
    if (live >= total && total > 0) {
      return fail("This post already published everywhere — duplicate it to publish again");
    }
  }

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
  // Only unpublished channels re-arm — published ones stay published (the
  // queue skips them), so a partial post never double-posts its live part.
  await db.postChannel.updateMany({
    where: { postId, status: { not: "published" } },
    data: { status: "scheduled", error: null },
  });
  await enqueuePublish(postId, when);
  // Count the transition into scheduled, not the click: re-saving an
  // already-scheduled post must not inflate the gauge (dashboard reads it).
  if (current?.status !== "scheduled") {
    await bumpUsage(ctx.active.org.id, "scheduled_posts");
  }
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
    new Date(),
    ctx.user.timezone || "UTC",
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
  const live = await db.postChannel.count({ where: { postId, status: "published" } });
  if (live > 0) {
    const total = await db.postChannel.count({ where: { postId } });
    if (live >= total && total > 0) {
      return fail("This post already published everywhere — duplicate it to publish again");
    }
  }
  const before = await db.post.findUnique({ where: { id: postId }, select: { status: true } });
  await db.post.update({ where: { id: postId }, data: { status: "scheduled", scheduledAt: new Date() } });
  await db.postChannel.updateMany({
    where: { postId, status: { not: "published" } },
    data: { status: "scheduled", error: null },
  });
  await enqueuePublish(postId, new Date());
  if (before?.status !== "scheduled") {
    await bumpUsage(ctx.active.org.id, "scheduled_posts");
  }
  // Scoped flush: this click must not drag every other tenant's due jobs
  // with it (the old global runDueJobs() did exactly that as a side effect).
  await runDueJobs(new Date(), { postId });
  revalidatePath("/calendar");
  revalidatePath("/queue");
  revalidatePath(`/composer/${postId}`);
  return ok(undefined, "Publishing now");
}

export async function unscheduleAction(postId: string) {
  const ctx = await withPermission("content.publish");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await cancelPublish(postId);
  const before = await db.post.findUnique({ where: { id: postId }, select: { status: true } });
  await db.post.update({ where: { id: postId }, data: { status: "draft", scheduledAt: null } });
  // Never reset channels that already went live: the queue's skip-published
  // guard relies on that flag, and flipping it would let a later reschedule
  // re-post a live channel to the real audience (duplicate).
  await db.postChannel.updateMany({ where: { postId, status: { not: "published" } }, data: { status: "pending" } });
  if (before?.status === "scheduled") {
    await debumpUsage(ctx.active.org.id, "scheduled_posts");
  }
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
  else {
    // Clamp the day: Jan 31 + 1 month must land on Feb 28/29, not roll into
    // March (setMonth overflows). Preserve the wall-clock time.
    const day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, lastDay));
  }
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

  // Occurrence refs are validated once: a stale or foreign campaignId on the
  // source must not propagate to every copy (see scopedCampaignRefs).
  const occurrenceRefs = await scopedCampaignRefs(wsId, src.campaignId, src.pillarId);

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
        campaignId: occurrenceRefs.campaignId,
        pillarId: occurrenceRefs.pillarId,
        firstComment: src.firstComment,
        utmSource: src.utmSource,
        utmMedium: src.utmMedium,
        utmCampaign: src.utmCampaign,
        // Copies are plain scheduled posts, not evergreen seeds — inheriting
        // isEvergreen let a recurring series spray the evergreen pool.
        isEvergreen: false,
        recurrence: JSON.stringify({ ...clean, of: postId }),
        // contentType travels with each channel: without it every occurrence
        // after the first silently downgraded carousels/reels/threads to
        // plain posts (the column default is "post").
        channels: {
          create: src.channels.map((c) => ({
            channelId: c.channelId,
            platform: c.platform,
            body: c.body,
            contentType: c.contentType,
            status: "scheduled",
          })),
        },
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
  // Only re-send channels that did NOT already publish, so retrying a partial
  // failure fixes the broken channels instead of double-posting the live ones.
  await db.postChannel.updateMany({
    where: { postId, status: { not: "published" } },
    data: { status: "scheduled", error: null },
  });
  await enqueuePublish(postId, new Date());
  // Scoped flush (see publishNowAction): never sweep other tenants' jobs.
  await runDueJobs(new Date(), { postId });
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
  const refs = await scopedCampaignRefs(ctx.active.workspace.id, src.campaignId, src.pillarId);
  const copy = await db.post.create({
    data: {
      workspaceId: src.workspaceId,
      authorId: ctx.user.id,
      title: src.title ? `${src.title} (copy)` : null,
      status: "draft",
      campaignId: refs.campaignId,
      pillarId: refs.pillarId,
      firstComment: src.firstComment,
      utmSource: src.utmSource,
      utmMedium: src.utmMedium,
      utmCampaign: src.utmCampaign,
      isEvergreen: src.isEvergreen,
      channels: {
        create: src.channels.map((c) => ({
          channelId: c.channelId,
          platform: c.platform,
          body: c.body,
          contentType: c.contentType,
        })),
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
  const before = await db.post.findUnique({ where: { id: postId }, select: { status: true } });
  await db.post.update({ where: { id: postId }, data: { status: "archived", archivedAt: new Date(), scheduledAt: null } });
  if (before?.status === "scheduled") {
    await debumpUsage(ctx.active.org.id, "scheduled_posts");
  }
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok(undefined, "Archived");
}

export async function deletePostAction(postId: string) {
  const ctx = await withPermission("content.delete");
  await ensureInWorkspace("post", postId, ctx.active.workspace.id);
  await cancelPublish(postId);
  const before = await db.post.findUnique({ where: { id: postId }, select: { status: true } });
  await db.post.delete({ where: { id: postId } });
  if (before?.status === "scheduled") {
    await debumpUsage(ctx.active.org.id, "scheduled_posts");
  }
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
  if (members.length > 0) {
    await debumpUsage(ctx.active.org.id, "scheduled_posts", members.length);
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

  const channels = await db.socialChannel.findMany({
    where: { workspaceId: wsId },
    select: { id: true, platform: true },
  });
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
      // Same readiness bar as the composer: a row pointing at a
      // disconnected/unsupported channel must land as a draft with a reason,
      // not as "scheduled" only to fail loudly on the next tick.
      try {
        await assertReady(post.id);
      } catch (e) {
        await db.post.update({ where: { id: post.id }, data: { status: "draft", scheduledAt: null } });
        await db.postChannel.updateMany({ where: { postId: post.id }, data: { status: "pending" } });
        drafts++;
        errors.push(`"${(rec.title || body).slice(0, 40)}": ${e instanceof Error ? e.message : "not ready"} — imported as draft`);
        continue;
      }
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

const BULK_MAX_IDS = 100;

async function forEachOwned(ids: string[], workspaceId: string, fn: (id: string) => Promise<void>) {
  // Unbounded client arrays turn one click into an unbounded sequential loop —
  // callers enforce BULK_MAX_IDS up front and surface it as a message.
  const owned = await db.post.findMany({ where: { id: { in: ids }, workspaceId }, select: { id: true } });
  let n = 0;
  for (const { id } of owned) { await fn(id); n++; }
  return n;
}

function bulkIds(ids: string[]): string[] | null {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= BULK_MAX_IDS ? ids : null;
}

export async function bulkDeletePostsAction(ids: string[]) {
  const ctx = await withPermission("content.delete");
  const scoped = bulkIds(ids);
  if (!scoped) return fail(`Select 1–${BULK_MAX_IDS} posts at a time`);
  const scheduledCount = await db.post.count({
    where: { id: { in: scoped }, workspaceId: ctx.active.workspace.id, status: "scheduled" },
  });
  const n = await forEachOwned(scoped, ctx.active.workspace.id, async (id) => {
    await cancelPublish(id);
    await db.post.delete({ where: { id } });
  });
  if (scheduledCount > 0) await debumpUsage(ctx.active.org.id, "scheduled_posts", scheduledCount);
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok({ n }, `Deleted ${n} post${n === 1 ? "" : "s"}`);
}

export async function bulkUnschedulePostsAction(ids: string[]) {
  const ctx = await withPermission("content.publish");
  const scoped = bulkIds(ids);
  if (!scoped) return fail(`Select 1–${BULK_MAX_IDS} posts at a time`);
  const scheduledCount = await db.post.count({
    where: { id: { in: scoped }, workspaceId: ctx.active.workspace.id, status: "scheduled" },
  });
  const n = await forEachOwned(scoped, ctx.active.workspace.id, async (id) => {
    await cancelPublish(id);
    await db.post.update({ where: { id }, data: { status: "draft", scheduledAt: null } });
    // Same live-channel protection as unscheduleAction: published channels
    // keep their flag so the skip-published guard survives bulk moves.
    await db.postChannel.updateMany({ where: { postId: id, status: { not: "published" } }, data: { status: "pending" } });
  });
  if (scheduledCount > 0) await debumpUsage(ctx.active.org.id, "scheduled_posts", scheduledCount);
  revalidatePath("/calendar");
  revalidatePath("/queue");
  return ok({ n }, `Moved ${n} post${n === 1 ? "" : "s"} back to draft`);
}

export async function bulkDuplicatePostsAction(ids: string[]) {
  const ctx = await withPermission("content.create");
  const scoped = bulkIds(ids);
  if (!scoped) return fail(`Select 1–${BULK_MAX_IDS} posts at a time`);
  const owned = await db.post.findMany({
    where: { id: { in: scoped }, workspaceId: ctx.active.workspace.id },
    include: { channels: true, media: true, tags: true },
  });
  for (const src of owned) {
    const refs = await scopedCampaignRefs(ctx.active.workspace.id, src.campaignId, src.pillarId);
    await db.post.create({
      data: {
        workspaceId: src.workspaceId,
        authorId: ctx.user.id,
        title: src.title ? `${src.title} (copy)` : null,
        status: "draft",
        campaignId: refs.campaignId,
        pillarId: refs.pillarId,
        firstComment: src.firstComment,
        utmSource: src.utmSource,
        utmMedium: src.utmMedium,
        utmCampaign: src.utmCampaign,
        isEvergreen: src.isEvergreen,
        channels: {
          create: src.channels.map((c) => ({
            channelId: c.channelId,
            platform: c.platform,
            body: c.body,
            contentType: c.contentType,
          })),
        },
        media: { create: src.media.map((m) => ({ mediaId: m.mediaId, order: m.order })) },
        tags: { create: src.tags.map((t) => ({ tagId: t.tagId })) },
      },
    });
  }
  revalidatePath("/composer");
  revalidatePath("/calendar");
  return ok({ n: owned.length }, `Duplicated ${owned.length} post${owned.length === 1 ? "" : "s"} as drafts`);
}
