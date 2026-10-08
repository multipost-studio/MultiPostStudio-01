import { logger } from "@/lib/logger";
import { chooseModel } from "./models";
import type { AiProviderAdapter } from "./providers/types";

const LIST_TIMEOUT_MS = 10_000;

/**
 * The best model this key can use right now, from what the provider reports, or
 * null if the provider could not be asked or offers nothing that fits. Used to
 * repair a retired model: a hard-coded id the provider no longer lists is no help.
 */
export async function discoverModel(adapter: AiProviderAdapter, apiKey: string): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), LIST_TIMEOUT_MS);
  try {
    const available = await adapter.listModels(apiKey, ctrl.signal);
    return chooseModel(available, adapter.modelPreference, adapter.modelFallback);
  } catch (err) {
    logger.warn({ err, provider: adapter.id }, "listing AI models failed");
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Like discoverModel, but never null: connecting a key must not fail over model discovery. */
export async function resolveModel(adapter: AiProviderAdapter, apiKey: string): Promise<string> {
  return (await discoverModel(adapter, apiKey)) ?? adapter.defaultModel;
}
