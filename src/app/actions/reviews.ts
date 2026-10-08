"use server";

import { revalidatePath } from "next/cache";
import { requireWorkspace } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { orgPlan } from "@/lib/entitlements";
import { loadReviewConfig } from "@/lib/reviews/store";
import { issuesOf, userReviewSchema, type ReviewStatus } from "@/lib/reviews/model";
import { shouldAsk, snoozeUntil } from "@/lib/reviews/prompt";
import { countPublishedPosts, deleteMyReview, getMyReview, getPromptState, recordPromptShown, saveMyReview, setPromptStatus } from "@/lib/reviews/repo";

/**
 * The signed-in user's side of reviews: the "would you review us?" popup and writing,
 * editing or withdrawing their own review. Nothing here can touch anyone else's review.
 */

export type MyReview = { rating: number; title: string; body: string; displayName: string; role: string; publicConsent: boolean; status: ReviewStatus };
export type ReviewPromptCheck = { ask: boolean; delaySeconds: number; defaults: { displayName: string; role: string } };
export type SubmitResult =
  | { ok: true; visibility: "published" | "queued" | "private"; thanks: { title: string; body: string }; externalLinks: { id: string; label: string; url: string }[] }
  | { ok: false; errors: string[] };

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Operator kill switch (e2e runs, incidents): the popup never shows. */
const killed = () => process.env.REVIEW_PROMPT_DISABLED === "1";

/** Should the popup open now? Cheap, never throws: it is called from every app page. */
export async function checkReviewPromptAction(): Promise<ReviewPromptCheck> {
  const quiet: ReviewPromptCheck = { ask: false, delaySeconds: 20, defaults: { displayName: "", role: "" } };
  if (killed()) return quiet;
  try {
    const ctx = await requireWorkspace();
    const config = await loadReviewConfig();
    if (!config.prompt.enabled) return quiet;
    const [state, review, posts, plan] = await Promise.all([
      getPromptState(ctx.user.id),
      getMyReview(ctx.user.id),
      countPublishedPosts(ctx.user.id),
      orgPlan(ctx.active.org.id),
    ]);
    const decision = shouldAsk(config.prompt, {
      now: new Date(),
      userCreatedAt: new Date(ctx.user.createdAt),
      publishedPosts: posts,
      isPaid: plan.key !== "free",
      hasReview: review !== null,
      state: state ? { askCount: state.askCount, snoozeUntil: state.snoozeUntil, status: state.status } : null,
    });
    return { ask: decision.ask, delaySeconds: config.prompt.delaySeconds, defaults: { displayName: ctx.user.name, role: "" } };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.warn({ err }, "review prompt check failed");
    return quiet;
  }
}

/** The popup actually opened: counts toward the "stop asking after N" limit. */
export async function markReviewPromptShownAction(): Promise<void> {
  try {
    const ctx = await requireWorkspace();
    await recordPromptShown(ctx.user.id);
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.warn({ err }, "review prompt shown mark failed");
  }
}

export async function snoozeReviewPromptAction(): Promise<void> {
  try {
    const ctx = await requireWorkspace();
    const config = await loadReviewConfig();
    await setPromptStatus(ctx.user.id, { snoozeUntil: snoozeUntil(new Date(), config.prompt.snoozeDays) });
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.warn({ err }, "review prompt snooze failed");
  }
}

export async function declineReviewPromptAction(): Promise<void> {
  try {
    const ctx = await requireWorkspace();
    await setPromptStatus(ctx.user.id, { status: "declined" });
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.warn({ err }, "review prompt decline failed");
  }
}

/** The review this user already wrote (to edit it), plus sensible defaults when they have none. */
export async function getMyReviewAction(): Promise<{ review: MyReview | null; defaults: { displayName: string; role: string } }> {
  const ctx = await requireWorkspace();
  const defaults = { displayName: ctx.user.name, role: "" };
  try {
    const r = await getMyReview(ctx.user.id);
    if (!r) return { review: null, defaults };
    return {
      review: { rating: r.rating, title: r.title ?? "", body: r.body, displayName: r.authorName, role: r.authorRole ?? "", publicConsent: r.publicConsent, status: r.status },
      defaults,
    };
  } catch (err) {
    logger.warn({ err }, "load my review failed");
    return { review: null, defaults };
  }
}

export async function submitReviewAction(input: unknown): Promise<SubmitResult> {
  try {
    const ctx = await requireWorkspace();
    try {
      await enforceRateLimit(`review-submit:${ctx.user.id}`, 8, 60 * 60_000);
    } catch (err) {
      if (err instanceof RateLimitError) return { ok: false, errors: ["You've sent a few reviews just now. Please try again later."] };
      throw err;
    }
    const parsed = userReviewSchema.safeParse(input);
    if (!parsed.success) return { ok: false, errors: issuesOf(parsed.error) };
    const config = await loadReviewConfig();
    const saved = await saveMyReview({ userId: ctx.user.id, orgId: ctx.active.org.id, input: parsed.data, autoApprove: config.display.autoApprove });
    await setPromptStatus(ctx.user.id, { status: "reviewed" });
    await logAudit({
      actorId: ctx.user.id,
      orgId: ctx.active.org.id,
      action: "review.submitted",
      targetType: "review",
      targetId: saved.id,
      metadata: { rating: saved.rating, status: saved.status, publicConsent: saved.publicConsent },
    });
    if (saved.status === "approved") {
      revalidatePath("/");
      revalidatePath("/reviews");
    }
    revalidatePath("/admin/reviews");
    return {
      ok: true,
      visibility: saved.status === "approved" ? ("published" as const) : saved.publicConsent ? ("queued" as const) : ("private" as const),
      thanks: config.thanks,
      // Only invite a public review elsewhere from people who were happy to be public here.
      externalLinks: parsed.data.publicConsent ? config.externalLinks : [],
    };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "submit review failed");
    return { ok: false, errors: ["Couldn't save your review. Please try again."] };
  }
}

/** Withdraw the review: it is deleted, not just hidden. */
export async function removeMyReviewAction(): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireWorkspace();
    const existing = await getMyReview(ctx.user.id);
    await deleteMyReview(ctx.user.id);
    await setPromptStatus(ctx.user.id, { status: "declined" });
    if (existing) {
      await logAudit({ actorId: ctx.user.id, orgId: ctx.active.org.id, action: "review.withdrawn", targetType: "review", targetId: existing.id });
      revalidatePath("/");
      revalidatePath("/reviews");
      revalidatePath("/admin/reviews");
    }
    return { ok: true };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.error({ err }, "remove review failed");
    return { ok: false, error: "Couldn't remove your review." };
  }
}
