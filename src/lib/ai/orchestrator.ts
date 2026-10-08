import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { getDefaultAiCredential, healCredentialModel, touchAiCredentialUsage, type ResolvedAiCredential } from "./credentials";
import { classifyProviderError, type AiFailureReason } from "./models";
import { getAiProviderAdapter } from "./providers/registry";

/**
 * The single call site every AI feature goes through (lib/adapters/ai.ts's llm()).
 * Resolves the workspace's own connected provider credential and calls its
 * adapter. When nothing is connected or the call fails it returns null text plus
 * the reason, so the caller can fall back to templated output AND tell the user
 * why (no key, rejected key, out of quota…) instead of failing silently.
 */
export type AiOutcome =
  | { text: string; provider: string }
  | { text: null; reason: "no_key" | "empty" | AiFailureReason; provider?: string };

const CALL_TIMEOUT_MS = 45_000;

async function attempt(credential: ResolvedAiCredential, model: string, system: string, user: string, maxTokens: number): Promise<{ text: string } | { error: unknown }> {
  const adapter = getAiProviderAdapter(credential.provider);
  if (!adapter) return { error: new Error("unknown provider") };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await adapter.generateText({ system, user, maxTokens, apiKey: credential.apiKey, model, signal: ctrl.signal });
    return { text: res.text.trim() };
  } catch (error) {
    return { error };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateTextDetailed(workspaceId: string, system: string, user: string, maxTokens: number): Promise<AiOutcome> {
  const credential = await getDefaultAiCredential(workspaceId);
  if (!credential) return { text: null, reason: "no_key" };

  let result = await attempt(credential, credential.model, system, user, maxTokens);

  // A retired model is the one failure we can repair on the spot: re-pick from what the
  // provider offers now, remember it, and retry once.
  if ("error" in result && classifyProviderError(result.error) === "model_unavailable") {
    const next = await healCredentialModel(credential).catch(() => null);
    if (next) result = await attempt(credential, next, system, user, maxTokens);
  }

  if ("error" in result) {
    const reason = classifyProviderError(result.error);
    logger.error({ err: result.error, workspaceId, provider: credential.provider, reason }, "AI provider call failed — falling back to templated output");
    // A rejected key should read "Invalid key" in Settings, not keep showing "Connected".
    if (reason === "invalid_key") {
      await db.aiProviderCredential.update({ where: { id: credential.id }, data: { status: "invalid" } }).catch(() => undefined);
    }
    return { text: null, reason, provider: credential.provider };
  }

  if (!result.text) return { text: null, reason: "empty", provider: credential.provider };
  touchAiCredentialUsage(credential.id);
  return { text: result.text, provider: credential.provider };
}

/** Text only, for callers that do not care why it failed. */
export async function generateTextForWorkspace(workspaceId: string, system: string, user: string, maxTokens: number): Promise<string | null> {
  return (await generateTextDetailed(workspaceId, system, user, maxTokens)).text;
}
