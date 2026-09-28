import type { AiProviderAdapter, AiProviderId } from "./types";
import { openaiAdapter } from "./openai";
import { geminiAdapter } from "./gemini";
import { anthropicAdapter } from "./anthropic";

// Explicit provider list only — no "paste any key and we'll guess" support.
// Adding groq/openrouter/mistral/xai later means adding one adapter file and
// one entry here, nothing else in this object changes shape.
export const AI_PROVIDERS: Record<AiProviderId, AiProviderAdapter> = {
  openai: openaiAdapter,
  gemini: geminiAdapter,
  anthropic: anthropicAdapter,
};

export const AI_PROVIDER_IDS = Object.keys(AI_PROVIDERS) as AiProviderId[];

export function getAiProviderAdapter(id: string): AiProviderAdapter | null {
  return (AI_PROVIDERS as Record<string, AiProviderAdapter>)[id] ?? null;
}

export function isAiProviderId(id: string): id is AiProviderId {
  return id in AI_PROVIDERS;
}
