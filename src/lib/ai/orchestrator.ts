import { logger } from "@/lib/logger";
import { getDefaultAiCredential, touchAiCredentialUsage } from "./credentials";
import { getAiProviderAdapter } from "./providers/registry";

/**
 * The single call site every AI feature goes through once BYOK is enabled
 * (flags.aiByok — lib/adapters/ai.ts's llm() picks this path or the legacy
 * ANTHROPIC_API_KEY path). Resolves the workspace's own connected provider
 * credential and calls its adapter; returns null when nothing is connected
 * or the call fails, exactly like the legacy path's "no key configured"
 * behavior — callers already treat null as "fall back to templated output".
 */
export async function generateTextForWorkspace(
  workspaceId: string,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string | null> {
  const credential = await getDefaultAiCredential(workspaceId);
  if (!credential) return null;
  const adapter = getAiProviderAdapter(credential.provider);
  if (!adapter) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await adapter.generateText({
      system,
      user,
      maxTokens,
      apiKey: credential.apiKey,
      model: credential.model,
      signal: ctrl.signal,
    });
    touchAiCredentialUsage(credential.id);
    return res.text.trim() || null;
  } catch (e) {
    logger.error(
      { err: e, workspaceId, provider: credential.provider },
      "AI provider call failed — falling back to templated output",
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
