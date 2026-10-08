import type { ReviewConfig } from "./config";

/** Whether to show the "would you review us?" popup to a user right now. Pure. */

export type PromptFacts = {
  now: Date;
  userCreatedAt: Date;
  publishedPosts: number;
  isPaid: boolean;
  hasReview: boolean;
  state: { askCount: number; snoozeUntil: Date | null; status: string } | null;
};

export type PromptDecision = { ask: boolean; reason: string };

const DAY_MS = 86_400_000;

export function shouldAsk(config: ReviewConfig["prompt"], f: PromptFacts): PromptDecision {
  if (!config.enabled) return { ask: false, reason: "disabled" };
  if (f.hasReview) return { ask: false, reason: "already-reviewed" };
  if (f.state?.status === "reviewed") return { ask: false, reason: "already-reviewed" };
  if (f.state?.status === "declined") return { ask: false, reason: "declined" };
  if ((f.state?.askCount ?? 0) >= config.maxAsks) return { ask: false, reason: "asked-enough" };
  if (f.state?.snoozeUntil && f.state.snoozeUntil.getTime() > f.now.getTime()) return { ask: false, reason: "snoozed" };
  if (f.now.getTime() - f.userCreatedAt.getTime() < config.minAccountDays * DAY_MS) return { ask: false, reason: "too-new" };
  if (f.publishedPosts < config.minPublishedPosts) return { ask: false, reason: "not-enough-posts" };
  if (config.audience === "paid" && !f.isPaid) return { ask: false, reason: "audience" };
  return { ask: true, reason: "eligible" };
}

export function snoozeUntil(now: Date, days: number): Date {
  return new Date(now.getTime() + days * DAY_MS);
}
