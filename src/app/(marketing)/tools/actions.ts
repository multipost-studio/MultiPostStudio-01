"use server";

// Public, unauthenticated free-tool actions. Pure generation, no DB writes.

import * as ai from "@/lib/adapters/ai";
import type { PlatformKey } from "@/lib/constants";
import { enforceRateLimit, RateLimitError, clientIp } from "@/lib/rate-limit";

async function toolsGuard(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    // 30 free-tool calls/min/IP — local CPU today, but unthrottled public
    // compute becomes free abuse the moment a remote fallback is added.
    await enforceRateLimit(`tools:${await clientIp()}`, 30, 60_000);
    return { ok: true };
  } catch (e) {
    if (e instanceof RateLimitError) return { ok: false, error: e.message };
    throw e;
  }
}

export async function freeCaptionAction(_prev: unknown, formData: FormData) {
  const g = await toolsGuard();
  if (!g.ok) return { ...g, results: [] as string[] };
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 500);
  const platform = (String(formData.get("platform") ?? "instagram") as PlatformKey);
  const tone = String(formData.get("tone") ?? "Friendly").slice(0, 40);
  if (!prompt) return { ok: false, error: "Describe your post", results: [] as string[] };
  return { ok: true, results: ai.generateCaptions({ prompt, platform, tone, count: 3 }) };
}

export async function freeHashtagAction(_prev: unknown, formData: FormData) {
  const g = await toolsGuard();
  if (!g.ok) return { ...g, results: [] as string[] };
  const topic = String(formData.get("topic") ?? "").trim().slice(0, 200);
  if (!topic) return { ok: false, error: "Enter a topic", results: [] as string[] };
  return { ok: true, results: ai.generateHashtags(topic, 12) };
}
