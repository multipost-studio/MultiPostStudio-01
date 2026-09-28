import type { AiProviderAdapter, CredentialValidation, TextGenerationRequest, TextGenerationResponse } from "./types";

async function generateText(req: TextGenerationRequest): Promise<TextGenerationResponse> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: req.apiKey });
  const res = await client.messages.create(
    {
      model: req.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    },
    { signal: req.signal },
  );
  const text = res.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n")
    .trim();
  return { text };
}

async function validateCredentials(apiKey: string): Promise<CredentialValidation> {
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    // Cheapest real call that proves the key works: 1 max_tokens still
    // authenticates and reaches the model.
    await client.messages.create({
      model: anthropicAdapter.defaultModel,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return { ok: true };
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 401 || status === 403) return { ok: false, reason: "invalid_key" };
    if (status === undefined) return { ok: false, reason: "unreachable" };
    return { ok: false, reason: "unknown" };
  }
}

export const anthropicAdapter: AiProviderAdapter = {
  id: "anthropic",
  label: "Anthropic",
  apiKeyUrl: "https://console.anthropic.com/settings/keys",
  defaultModel: "claude-sonnet-5",
  models: ["claude-opus-5-5", "claude-sonnet-5", "claude-haiku-4-5-20251001"],
  generateText,
  validateCredentials,
};
