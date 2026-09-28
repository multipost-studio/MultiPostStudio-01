// Provider-adapter contract for BYOK AI. Every supported provider (openai |
// gemini | anthropic today; groq | openrouter | mistral | xai later) gets one
// adapter implementing this shape — see registry.ts for the lookup table and
// orchestrator.ts for the single call site that uses it.
//
// Only generateText is implemented for Phase 1: every existing AI feature in
// lib/adapters/ai.ts is a single system+user text completion, nothing here
// streams or touches images/vision yet. streamText/analyzeImage/generateImage
// are declared as optional so a later provider (or a later feature) can add
// them without changing this interface or any existing adapter.

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
  | { ok: false; reason: "invalid_key" | "unreachable" | "unknown" };

export interface AiProviderAdapter {
  id: AiProviderId;
  label: string;
  /** Official docs page users can visit to get/manage their key. Never invent one. */
  apiKeyUrl: string;
  defaultModel: string;
  /** Models offered in the UI's model picker. Static list — no providers here expose a cheap list-models call worth round-tripping on every page load. */
  models: string[];

  generateText(req: TextGenerationRequest): Promise<TextGenerationResponse>;

  /** Cheap, low-token call used by "Test Connection" — must not be expensive. */
  validateCredentials(apiKey: string): Promise<CredentialValidation>;
}
