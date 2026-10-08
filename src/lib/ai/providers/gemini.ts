import { ProviderHttpError, classifyProviderError } from "../models";
import type { AiProviderAdapter, CredentialValidation, TextGenerationRequest, TextGenerationResponse } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";
/** Ids that generate text but are not what we want for captions (embeddings, images, live audio, open-weights…). */
const NOT_TEXT = /(embedding|aqa|imagen|veo|tts|image|live|audio|native|robotics|computer|learnlm|gemma)/;

// The key goes in a header, not the URL: URLs end up in logs and error messages.
const headers = (apiKey: string) => ({ "x-goog-api-key": apiKey, "content-type": "application/json" });

async function generateText(req: TextGenerationRequest): Promise<TextGenerationResponse> {
  const res = await fetch(`${BASE}/models/${encodeURIComponent(req.model)}:generateContent`, {
    method: "POST",
    headers: headers(req.apiKey),
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { maxOutputTokens: req.maxTokens },
    }),
    signal: req.signal,
  });
  if (!res.ok) throw new ProviderHttpError("gemini", res.status, await res.text());
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return { text };
}

async function listModels(apiKey: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: headers(apiKey), signal });
  if (!res.ok) throw new ProviderHttpError("gemini", res.status, await res.text());
  const data = (await res.json()) as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
  return (data.models ?? [])
    .filter((m) => (m.supportedGenerationMethods ?? []).includes("generateContent"))
    .map((m) => (m.name ?? "").replace(/^models\//, ""))
    .filter((id) => /^gemini-/.test(id) && !NOT_TEXT.test(id));
}

async function validateCredentials(apiKey: string): Promise<CredentialValidation> {
  try {
    await listModels(apiKey); // free: no generation tokens spent
    return { ok: true };
  } catch (e) {
    // Google answers a bad key with 400 ("API key not valid"), not 401.
    if (e instanceof ProviderHttpError && e.status === 400 && /api key/i.test(e.body)) return { ok: false, reason: "invalid_key" };
    const reason = classifyProviderError(e);
    if (reason === "invalid_key" || reason === "quota" || reason === "unreachable") return { ok: false, reason };
    return { ok: false, reason: "unknown" };
  }
}

export const geminiAdapter: AiProviderAdapter = {
  id: "gemini",
  label: "Google Gemini",
  blurb: "Gemini models for captions, ideas, hooks and rewrites.",
  apiKeyUrl: "https://aistudio.google.com/app/apikey",
  defaultModel: "gemini-2.5-flash",
  modelPreference: [/^gemini-[\d.]+-flash$/],
  modelFallback: /^gemini-[\d.]+-(flash|pro)/,
  generateText,
  validateCredentials,
  listModels,
};
