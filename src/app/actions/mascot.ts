"use server";

import { requireWorkspace } from "@/lib/session";
import { logger } from "@/lib/logger";
import { NAV, SETTINGS_NAV } from "@/lib/nav";
import { composeAnswer } from "@/lib/mascot-brain/compose";
import { loadWorkspaceFacts } from "@/lib/mascot-brain/facts";
import { buildInsights } from "@/lib/mascot-brain/insights";
import { parseIntent, type RouteEntry } from "@/lib/mascot-brain/intents";
import type { Insight, MascotAnswer } from "@/lib/mascot-brain/types";

const MAX_QUESTION = 200;
const MAX_INSIGHTS = 8;

export type BriefingResult = { ok: true; insights: Insight[]; generatedAt: string } | { ok: false };
export type AskResult = { ok: true; answer: MascotAnswer } | { ok: false; error: string };

function isRedirect(err: unknown): boolean {
  return typeof err === "object" && err !== null && "digest" in err && String((err as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}

/** Pages this viewer may open: the sidebar minus anything their role hides, plus Settings. */
function routesFor(permissions: readonly string[]): RouteEntry[] {
  const perms = new Set(permissions);
  return [
    ...NAV.flatMap((g) => g.items).filter((i) => !i.permission || perms.has(i.permission)).map((i) => ({ label: i.label, href: i.href })),
    ...SETTINGS_NAV.map((s) => ({ label: s.label, href: s.href })),
  ];
}

/**
 * The companion's ranked list of things worth the user's attention, computed
 * from live workspace data and filtered to what their role can act on.
 */
export async function getMascotBriefingAction(): Promise<BriefingResult> {
  try {
    const ctx = await requireWorkspace();
    const facts = await loadWorkspaceFacts(ctx);
    return { ok: true, insights: buildInsights(facts).slice(0, MAX_INSIGHTS), generatedAt: facts.generatedAt };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.warn({ err }, "mascot briefing failed");
    return { ok: false };
  }
}

/**
 * Answer a typed question. The text is only ever matched against a fixed
 * vocabulary (it never reaches a database query or a model), and every number in
 * the reply is read from the caller's own workspace.
 */
export async function askMascotAction(question: string): Promise<AskResult> {
  try {
    const ctx = await requireWorkspace();
    if (typeof question !== "string") return { ok: false, error: "Ask a question in words." };
    const q = question.replace(/\s+/g, " ").trim();
    if (!q) return { ok: false, error: "Type a question first." };
    if (q.length > MAX_QUESTION) return { ok: false, error: `Keep it under ${MAX_QUESTION} characters.` };

    const { rateLimit } = await import("@/lib/rate-limit");
    const rl = await rateLimit(`mascot:ask:${ctx.user.id}`, 30, 60_000).catch(() => ({ ok: true }));
    if (!rl.ok) return { ok: false, error: "Slow down a little and try again in a moment." };

    const facts = await loadWorkspaceFacts(ctx);
    const parsed = parseIntent(q, routesFor(ctx.active.permissions));
    return { ok: true, answer: composeAnswer(parsed, facts, buildInsights(facts)) };
  } catch (err) {
    if (isRedirect(err)) throw err;
    logger.warn({ err }, "mascot ask failed");
    return { ok: false, error: "I could not look that up just now. Try again in a moment." };
  }
}
