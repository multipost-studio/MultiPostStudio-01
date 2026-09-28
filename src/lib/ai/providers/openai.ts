import type { AiProviderAdapter, CredentialValidation, TextGenerationRequest, TextGenerationResponse } from "./types";

async function generateText(req: TextGenerationRequest): Promise<TextGenerationResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${req.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens,
      messages: [
        { role: "system", content: req.system },
        { role: "user", content: req.user },
      ],
    }),
    signal: req.signal,
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = (data.choices?.[0]?.message?.content ?? "").trim();
  return { text };
}

async function validateCredentials(apiKey: string): Promise<CredentialValidation> {
  try {
    // Cheapest real check: list models. No completion tokens spent.
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401) return { ok: false, reason: "invalid_key" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export const openaiAdapter: AiProviderAdapter = {
  id: "openai",
  label: "OpenAI",
  apiKeyUrl: "https://platform.openai.com/api-keys",
  defaultModel: "gpt-4o-mini",
  models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"],
  generateText,
  validateCredentials,
};
