// Provider-adapter contract for BYOK AI. Every supported provider (openai |
// gemini | anthropic today; groq | openrouter | mistral | xai later) gets one
// adapter implementing this shape — see registry.ts for the lookup table and
// orchestrator.ts for the single call site that uses it.
//
// Only generateText is implemented for Phase 1: every existing AI feature in
// lib/adapters/ai.ts is a single system+user text completion, nothing here
// streams or touches images/vision yet.

export type AiProviderId = "openai" | "gemini" | "anthropic";

export interface TextGenerationRequest {
  system: string;
  user: string;
  maxTokens: number;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}

export interface TextGenerationResponse {
  text: string;
}

export type CredentialValidation =
  | { ok: true }
  | { ok: false; reason: "invalid_key" | "unreachable" | "unknown" | "quota" | "model_unavailable" };

export interface AiProviderAdapter {
  id: AiProviderId;
  label: string;
  /** One line shown on the provider's card. */
  blurb: string;
  /** Official docs page users can visit to get/manage their key. Never invent one. */
  apiKeyUrl: string;
  /**
   * Last-resort model id, used only when the provider cannot be asked what it
   * offers. Normally the model comes from listModels + modelPreference.
   */
  defaultModel: string;
  /** Ranked picks from what the provider reports: an id, or a pattern meaning "newest match". */
  modelPreference: (string | RegExp)[];
  /** Used after the preferences, so a key always lands on some text model if one exists. */
  modelFallback: RegExp;

  generateText(req: TextGenerationRequest): Promise<TextGenerationResponse>;

  /** Cheap check that the key authenticates. No generation tokens spent. */
  validateCredentials(apiKey: string): Promise<CredentialValidation>;

  /** Text-generation model ids this key can use right now. Throws ProviderHttpError on a non-2xx. */
  listModels(apiKey: string, signal?: AbortSignal): Promise<string[]>;
}
