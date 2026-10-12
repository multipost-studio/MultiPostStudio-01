import { logger } from "@/lib/logger";
import { db } from "@/lib/db";
import { getDefaultAiCredential, healCredentialModel, touchAiCredentialUsage, type ResolvedAiCredential } from "./credentials";
import { classifyProviderError, type AiFailureReason } from "./models";
import { getAiProviderAdapter } from "./providers/registry";
import { recordAiCall } from "./call-log";
import { pausedMessage } from "@/lib/kill-switches";

/**
 * The single call site every AI feature goes through (lib/adapters/ai.ts's llm()).
 * Resolves the workspace's own connected provider credential and calls its
 * adapter. When nothing is connected or the call fails it returns null text plus
 * the reason, so the caller can fall back to templated output AND tell the user
 * why (no key, rejected key, out of quota…) instead of failing silently.
 */
export type AiOutcome =
  | { text: string; provider: string }
  | { text: null; reason: "no_key" | "empty" | "paused" | AiFailureReason; provider?: string };

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

  // A staff-set pause (everyone, this organization, or this provider) stops the call before it is made.
  const paused = await pausedMessage("ai", {
    orgId: async () => (await db.workspace.findUnique({ where: { id: workspaceId }, select: { orgId: true } }))?.orgId ?? null,
    providers: [credential.provider],
  });
  if (paused) return { text: null, reason: "paused", provider: credential.provider };

  const inputChars = system.length + user.length;
  /** Time one attempt and add it to the call log (volume, failure reason and latency per provider; never the text). */
  const timed = async (model: string): Promise<Awaited<ReturnType<typeof attempt>>> => {
    const started = Date.now();
    const out = await attempt(credential, model, system, user, maxTokens);
    const failed = "error" in out;
    recordAiCall({
      workspaceId,
      provider: credential.provider,
      model,
      ok: !failed && out.text.length > 0,
      reason: failed ? classifyProviderError(out.error) : out.text.length > 0 ? null : "empty",
      latencyMs: Date.now() - started,
      inputChars,
      outputChars: failed ? 0 : out.text.length,
    });
    return out;
  };

  let result = await timed(credential.model);

  // A retired model is the one failure we can repair on the spot: re-pick from what the
  // provider offers now, remember it, and retry once.
  if ("error" in result && classifyProviderError(result.error) === "model_unavailable") {
    const next = await healCredentialModel(credential).catch(() => null);
    if (next) result = await timed(next);
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
