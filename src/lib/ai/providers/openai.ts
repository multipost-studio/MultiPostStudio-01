import { ProviderHttpError, classifyProviderError } from "../models";
import type { AiProviderAdapter, CredentialValidation, TextGenerationRequest, TextGenerationResponse } from "./types";

/** Ids that are not chat/text models (audio, images, embeddings, moderation…). */
const NOT_TEXT = /(audio|realtime|image|transcribe|tts|whisper|embedding|moderation|dall-e|search|instruct|codex|davinci|babbage|sora|computer-use)/;

async function generateText(req: TextGenerationRequest): Promise<TextGenerationResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${req.apiKey}`, "content-type": "application/json" },
    // max_completion_tokens is the current name; newer models reject the old max_tokens.
    body: JSON.stringify({
      model: req.model,
      max_completion_tokens: req.maxTokens,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
    signal: req.signal,
  });
  if (!res.ok) throw new ProviderHttpError("openai", res.status, await res.text());
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  return { text };
}

async function listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${apiKey}` }, signal });
  if (!res.ok) throw new ProviderHttpError("openai", res.status, await res.text());
  const data = (await res.json()) as { data?: { id?: string }[] };
  return (data.data ?? []).map((m) => m.id ?? "").filter((id) => /^(gpt|o\d)/.test(id) && !NOT_TEXT.test(id));
}

async function validateCredentials(apiKey: string): Promise<CredentialValidation> {
  try {
    await listModels(apiKey); // free: no completion tokens spent
    return { ok: true };
  } catch (e) {
    const reason = classifyProviderError(e);
    if (reason === "invalid_key" || reason === "quota" || reason === "unreachable") return { ok: false, reason };
    return { ok: false, reason: "unknown" };
  }
}

export const openaiAdapter: AiProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  blurb: "GPT models for captions, ideas, hooks and rewrites.",
  apiKeyUrl: "https://platform.openai.com/api-keys",
  defaultModel: "gpt-4o-mini",
  modelPreference: [/^gpt-5(\.\d+)?-mini$/, /^gpt-4\.1-mini$/, "gpt-4o-mini"],
  modelFallback: /^gpt-\d/,
  generateText,
  validateCredentials,
  listModels,
};
