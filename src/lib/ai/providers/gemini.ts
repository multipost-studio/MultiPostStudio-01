import type { AiProviderAdapter, CredentialValidation, TextGenerationRequest, TextGenerationResponse } from "./types";

async function generateText(req: TextGenerationRequest): Promise<TextGenerationResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${req.model}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.user }] }],
      generationConfig: { maxOutputTokens: req.maxTokens },
    }),
    signal: req.signal,
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const text = (data.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  return { text };
}

async function validateCredentials(apiKey: string): Promise<CredentialValidation> {
  try {
    // Cheapest real check: list models. No generation tokens spent.
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    );
    if (res.status === 400 || res.status === 403) return { ok: false, reason: "invalid_key" };
    if (!res.ok) return { ok: false, reason: "unknown" };
    return { ok: true };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export const geminiAdapter: AiProviderAdapter = {
  id: "gemini",
  label: "Google Gemini",
  apiKeyUrl: "https://aistudio.google.com/app/apikey",
  defaultModel: "gemini-2.0-flash",
  models: ["gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"],
  generateText,
  validateCredentials,
};
