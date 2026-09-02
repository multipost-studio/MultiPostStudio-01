"use server";

// Public, unauthenticated free-tool actions. Pure generation, no DB writes.

import * as ai from "@/lib/adapters/ai";
import type { PlatformKey } from "@/lib/constants";

export async function freeCaptionAction(_prev: unknown, formData: FormData) {
  const prompt = String(formData.get("prompt") ?? "").trim().slice(0, 500);
  const platform = (String(formData.get("platform") ?? "instagram") as PlatformKey);
  const tone = String(formData.get("tone") ?? "Friendly");
  if (!prompt) return { ok: false, error: "Describe your post", results: [] as string[] };
  return { ok: true, results: ai.generateCaptions({ prompt, platform, tone, count: 3 }) };
}

export async function freeHashtagAction(_prev: unknown, formData: FormData) {
  const topic = String(formData.get("topic") ?? "").trim().slice(0, 200);
  if (!topic) return { ok: false, error: "Enter a topic", results: [] as string[] };
  return { ok: true, results: ai.generateHashtags(topic, 12) };
}
