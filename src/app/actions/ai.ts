"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as ai from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import type { PlatformKey } from "@/lib/constants";
import { withPermission, ok, fail } from "./_helpers";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

/** Per-user cap on LLM-backed actions — abuse / runaway-cost guard.
 *  Limit is admin-configurable via /admin/settings (aiRateLimitPerMin). */
async function aiRateGuard(userId: string) {
  try {
    const { aiRateLimitPerMin } = await getSettings();
    await enforceRateLimit(`ai:${userId}`, aiRateLimitPerMin, 60_000);
    return null;
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }
}

async function brandFor(workspaceId: string): Promise<ai.BrandContext> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId } });
  return {
    name: ws?.name,
    voice: ws?.brandVoice,
    industry: ws?.industry,
    brainDigest: ws?.brandBrain,
  };
}

export async function aiGenerateCaptionsAction(input: {
  prompt: string;
  platform: PlatformKey;
  tone: string;
  count?: number;
}) {
  const ctx = await withPermission("content.create");
  const rl = await aiRateGuard(ctx.user.id);
  if (rl) return rl;
  if (!input.prompt.trim()) return fail("Describe what the post is about");
  const brand = await brandFor(ctx.active.workspace.id);
  const captions = await ai.captionsAsync({ ...input, brand });
  await bumpUsage(ctx.active.org.id, "ai_credits", input.count ?? 3);
  return ok(captions);
}

export async function aiGenerateIdeasAction(input: { topic: string; count?: number }) {
  const ctx = await withPermission("content.create");
  const rl = await aiRateGuard(ctx.user.id);
  if (rl) return rl;
  if (!input.topic.trim()) return fail("Enter a topic");
  const ws = await db.workspace.findUnique({ where: { id: ctx.active.workspace.id } });
  const ideas = await ai.ideasAsync({ topic: input.topic, industry: ws?.industry, count: input.count });
  await bumpUsage(ctx.active.org.id, "ai_credits", ideas.length);
  return ok(ideas);
}

export async function aiGenerateHooksAction(topic: string) {
  const ctx = await withPermission("content.create");
  const rl = await aiRateGuard(ctx.user.id);
  if (rl) return rl;
  await bumpUsage(ctx.active.org.id, "ai_credits", 5);
  return ok(await ai.hooksAsync(topic));
}

export async function aiRewriteAction(input: {
  text: string;
  mode: "shorten" | "expand" | "tone" | "rephrase";
  tone?: string;
  platform?: PlatformKey;
}) {
  const ctx = await withPermission("content.create");
  const rl = await aiRateGuard(ctx.user.id);
  if (rl) return rl;
  if (!input.text.trim()) return fail("Nothing to rewrite");
  await bumpUsage(ctx.active.org.id, "ai_credits", 1);
  return ok(await ai.rewriteAsync(input));
}

export async function aiHashtagsAction(topic: string) {
  const ctx = await withPermission("content.create");
  await bumpUsage(ctx.active.org.id, "ai_credits", 1);
  return ok(ai.generateHashtags(topic));
}

export async function aiCtasAction(topic: string) {
  const ctx = await withPermission("content.create");
  await bumpUsage(ctx.active.org.id, "ai_credits", 1);
  return ok(ai.generateCTAs(topic));
}

export async function aiAltTextAction(input: { filename: string; context?: string }) {
  await withPermission("media.manage");
  return ok(ai.generateAltText(input));
}

export async function aiRepurposeAction(input: { source: string; targets: PlatformKey[] }) {
  const ctx = await withPermission("content.create");
  const rl = await aiRateGuard(ctx.user.id);
  if (rl) return rl;
  if (!input.source.trim()) return fail("Paste the content to repurpose");
  const brand = await brandFor(ctx.active.workspace.id);
  await bumpUsage(ctx.active.org.id, "ai_credits", input.targets.length);
  return ok(await ai.repurposeAsync({ ...input, brand }));
}

export async function aiBlogToPostsAction(input: { title: string; body: string; count?: number }) {
  const ctx = await withPermission("content.create");
  const rl = await aiRateGuard(ctx.user.id);
  if (rl) return rl;
  if (!input.body.trim()) return fail("Paste the article body");
  await bumpUsage(ctx.active.org.id, "ai_credits", input.count ?? 4);
  return ok(await ai.blogToPostsAsync(input));
}

/** Persist a generated string as a new idea. */
export async function saveGeneratedIdeaAction(title: string, notes?: string) {
  const ctx = await withPermission("content.create");
  const count = await db.contentIdea.count({ where: { workspaceId: ctx.active.workspace.id, stage: "idea" } });
  await db.contentIdea.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      authorId: ctx.user.id,
      title: title.slice(0, 160),
      notes: notes ?? null,
      stage: "idea",
      sortIndex: count,
    },
  });
  revalidatePath("/ideas");
  return ok(undefined, "Saved to Ideas");
}

/** Persist a generated caption as a draft post and open the composer. */
export async function saveGeneratedDraftAction(body: string, platform: PlatformKey) {
  const ctx = await withPermission("content.create");
  const channel = await db.socialChannel.findFirst({
    where: { workspaceId: ctx.active.workspace.id, platform },
  });
  const post = await db.post.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      authorId: ctx.user.id,
      status: "draft",
      title: body.split("\n")[0]?.slice(0, 80) ?? "AI draft",
      channels: channel
        ? { create: [{ channelId: channel.id, platform, body }] }
        : undefined,
    },
  });
  redirect(`/composer/${post.id}`);
}
