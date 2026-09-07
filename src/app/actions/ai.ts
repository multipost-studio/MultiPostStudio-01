"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import * as ai from "@/lib/adapters/ai";
import { bumpUsage } from "@/lib/adapters/billing";
import type { PlatformKey, PlanKey } from "@/lib/constants";
import { withPermission, entitlementGuard, featureGuard, ok, fail, type ActionResult } from "./_helpers";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { getUsage } from "@/lib/adapters/billing";
import { getPlan } from "@/lib/plans";
import { bonusAiCreditsForOrg } from "@/lib/referrals";
import { affordable } from "@/lib/ai-credits";

type Ctx = Awaited<ReturnType<typeof withPermission>>;

/** What the caller gets when the gate lets it through. */
type Allowance = {
  /** Credits left this month; Infinity when the plan is unmetered. */
  remaining: number;
  /** Charge for work that actually happened. Never more than `remaining`. */
  charge: (units: number) => Promise<void>;
};

function isBlocked(g: Allowance | ActionResult): g is ActionResult {
  return "ok" in g;
}

/**
 * Gate an LLM-backed action:
 *  - per-user rate limit (aiRateLimitPerMin, admin-configurable)
 *  - monthly AI-credit budget = plan.aiCredits + referral-bonus credits
 *
 * Returns a fail() result to short-circuit, or an Allowance to proceed.
 *
 * Callers must charge through `allowance.charge` *after* the provider call
 * returns. Most of these actions used to call bumpUsage before awaiting the
 * model, so a provider timeout or 500 still billed the customer for output
 * they never received.
 *
 * The budget check is also a ceiling, not just a tripwire: it only refused
 * once usage was already at the limit, so an org one credit short of its cap
 * could ask for 50 captions and be charged for all 50.
 */
async function aiGuard(ctx: Ctx, entitlement = "ai_writer", label = "AI generation"): Promise<Allowance | ActionResult> {
  const orgId = ctx.active.org.id;

  // Platform kill switch first — cheapest check, and it's the one that has to
  // hold when an upstream provider is down or costs need to be cut off fast.
  const off = await featureGuard("ai_agent", "AI features");
  if (off) return off;

  const ent = await entitlementGuard(orgId, entitlement, label);
  if (ent) return ent;

  try {
    const { aiRateLimitPerMin } = await getSettings();
    await enforceRateLimit(`ai:${ctx.user.id}`, aiRateLimitPerMin, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }

  const sub = await db.subscription.findUnique({ where: { orgId }, include: { plan: true } });
  const [usage, plan, bonus] = await Promise.all([
    getUsage(orgId),
    getPlan((sub?.plan.key as PlanKey) ?? "free"),
    bonusAiCreditsForOrg(orgId),
  ]);
  const limit = plan.aiCredits + bonus;
  // limit <= 0 means the plan does not meter AI credits at all.
  const remaining = limit > 0 ? limit - usage.ai_credits : Number.POSITIVE_INFINITY;
  if (remaining <= 0) {
    return fail(
      `You've used all ${limit} AI credits this month. They reset on your billing date — upgrade your plan or invite a friend for bonus credits.`,
    );
  }
  return {
    remaining,
    charge: async (units: number) => {
      const billable = affordable(Math.round(units), remaining);
      if (billable > 0) await bumpUsage(orgId, "ai_credits", billable);
    },
  };
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
  const gate = await aiGuard(ctx, "ai_writer", "Caption generation");
  if (isBlocked(gate)) return gate;
  if (!input.prompt.trim()) return fail("Describe what the post is about");
  const count = affordable(input.count ?? 3, gate.remaining);
  if (count === 0) return fail("Not enough AI credits left for this request");
  const brand = await brandFor(ctx.active.workspace.id);
  const captions = await ai.captionsAsync({ ...input, count, brand });
  await gate.charge(captions.length);
  return ok(captions);
}

export async function aiGenerateIdeasAction(input: { topic: string; count?: number }) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_ideas", "AI content ideas");
  if (isBlocked(gate)) return gate;
  if (!input.topic.trim()) return fail("Enter a topic");
  const count = affordable(input.count ?? 6, gate.remaining);
  if (count === 0) return fail("Not enough AI credits left for this request");
  const ws = await db.workspace.findUnique({ where: { id: ctx.active.workspace.id } });
  const ideas = await ai.ideasAsync({ topic: input.topic, industry: ws?.industry, count });
  await gate.charge(ideas.length);
  return ok(ideas);
}

export async function aiGenerateHooksAction(topic: string) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_writer", "Hook generation");
  if (isBlocked(gate)) return gate;
  const hooks = await ai.hooksAsync(topic);
  await gate.charge(5);
  return ok(hooks);
}

export async function aiRewriteAction(input: {
  text: string;
  mode: "shorten" | "expand" | "tone" | "rephrase";
  tone?: string;
  platform?: PlatformKey;
}) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_writer", "AI rewrite");
  if (isBlocked(gate)) return gate;
  if (!input.text.trim()) return fail("Nothing to rewrite");
  const rewritten = await ai.rewriteAsync(input);
  await gate.charge(1);
  return ok(rewritten);
}

export async function aiHashtagsAction(topic: string) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_hashtags", "AI hashtag generation");
  if (isBlocked(gate)) return gate;
  const tags = ai.generateHashtags(topic);
  await gate.charge(1);
  return ok(tags);
}

export async function aiCtasAction(topic: string) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_writer", "AI CTA generation");
  if (isBlocked(gate)) return gate;
  const ctas = ai.generateCTAs(topic);
  await gate.charge(1);
  return ok(ctas);
}

export async function aiAltTextAction(input: { filename: string; context?: string }) {
  await withPermission("media.manage");
  return ok(ai.generateAltText(input));
}

export async function aiRepurposeAction(input: { source: string; targets: PlatformKey[] }) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_repurpose", "AI repurposing");
  if (isBlocked(gate)) return gate;
  if (!input.source.trim()) return fail("Paste the content to repurpose");
  const targets = input.targets.slice(0, affordable(input.targets.length, gate.remaining));
  if (targets.length === 0) return fail("Not enough AI credits left for this request");
  const brand = await brandFor(ctx.active.workspace.id);
  const out = await ai.repurposeAsync({ ...input, targets, brand });
  await gate.charge(targets.length);
  return ok(out);
}

export async function aiBlogToPostsAction(input: { title: string; body: string; count?: number }) {
  const ctx = await withPermission("content.create");
  const gate = await aiGuard(ctx, "ai_repurpose", "Blog to posts");
  if (isBlocked(gate)) return gate;
  if (!input.body.trim()) return fail("Paste the article body");
  const count = affordable(input.count ?? 4, gate.remaining);
  if (count === 0) return fail("Not enough AI credits left for this request");
  const posts = await ai.blogToPostsAsync({ ...input, count });
  await gate.charge(count);
  return ok(posts);
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
