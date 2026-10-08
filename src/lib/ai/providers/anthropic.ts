import { ProviderHttpError, classifyProviderError } from "../models";
import type { AiProviderAdapter, CredentialValidation, TextGenerationRequest, TextGenerationResponse } from "./types";

const API = "https://api.anthropic.com/v1";
const headers = (apiKey: string) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" });

async function generateText(req: TextGenerationRequest): Promise<TextGenerationResponse> {
  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: headers(req.apiKey),
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    }),
    signal: req.signal,
  });
  if (!res.ok) throw new ProviderHttpError("anthropic", res.status, await res.text());
  const data = (await res.json()) as { content?: { type?: string; text?: string }[] };
  const text = (data.content ?? [])
    .map((b) => (b.type === "text" ? (b.text ?? "") : ""))
    .join("\n")
    .trim();
  return { text };
}

async function listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${API}/models?limit=100`, { headers: headers(apiKey), signal });
  if (!res.ok) throw new ProviderHttpError("anthropic", res.status, await res.text());
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? []).map((m) => m.id ?? "").filter((id) => id.startsWith("claude-"));
}

async function validateCredentials(apiKey: string): Promise<CredentialValidation> {
  try {
    await listModels(apiKey); // free: no tokens spent, and it never depends on a model id staying alive
    return { ok: true };
  } catch (e) {
    const reason = classifyProviderError(e);
    if (reason === "invalid_key" || reason === "quota" || reason === "unreachable") return { ok: false, reason };
    return { ok: false, reason: "unknown" };
  }
}

export const anthropicAdapter: AiProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  blurb: "Claude models for captions, ideas, hooks and rewrites.",
  apiKeyUrl: "https://console.anthropic.com/settings/keys",
  defaultModel: "claude-sonnet-5-5",
  modelPreference: ["claude-sonnet-5-5", /^claude-sonnet-5/, /^claude-haiku-5/, /^claude-sonnet/],
  modelFallback: /^claude-/,
  generateText,
  validateCredentials,
  listModels,
};
