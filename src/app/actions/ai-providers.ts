"use server";

import { revalidatePath } from "next/cache";
import { getAiProviderAdapter, isAiProviderId } from "@/lib/ai/providers/registry";
import {
  connectAiCredential,
  disconnectAiCredential,
  setDefaultAiProvider,
  testAiCredential,
} from "@/lib/ai/credentials";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { withPermission, ok, fail } from "./_helpers";

const REASON_MESSAGE: Record<string, string> = {
  invalid_key: "That key was rejected by the provider — check it's correct and has the right permissions.",
  unreachable: "Couldn't reach the provider right now. Try again in a moment.",
  unknown: "The provider returned an unexpected error validating that key.",
  quota: "The key works but the provider says it is out of quota or rate limited. Check your plan and billing with the provider.",
  model_unavailable: "The key works but the provider has no usable text model for it. Check the key's permissions with the provider.",
};

export async function connectAiProviderAction(provider: string, apiKey: string) {
  const ctx = await withPermission("ai.providers.manage");
  if (!isAiProviderId(provider)) return fail("Unknown AI provider");
  const trimmed = apiKey.trim();
  if (!trimmed) return fail("Enter an API key");

  try {
    await enforceRateLimit(`ai-provider-connect:${ctx.user.id}`, 10, 60_000);
  } catch (e) {
    if (e instanceof RateLimitError) return fail(e.message);
    throw e;
  }

  const result = await connectAiCredential(ctx.active.workspace.id, ctx.user.id, provider, trimmed);
  if (!result.ok) return fail(REASON_MESSAGE[result.reason] ?? REASON_MESSAGE.unknown);

  revalidatePath("/settings/ai");
  const adapter = getAiProviderAdapter(provider);
  return ok(result.summary, `${adapter?.label ?? provider} connected`);
}

export async function testAiProviderAction(provider: string) {
  const ctx = await withPermission("ai.providers.manage");
  if (!isAiProviderId(provider)) return fail("Unknown AI provider");
  const result = await testAiCredential(ctx.active.workspace.id, provider);
  revalidatePath("/settings/ai");
  if (result.ok) {
    const model = result.model ? ` (${result.model})` : "";
    return ok(undefined, result.healed ? `Connection is working. Switched to ${result.model}, the model your account has now.` : `Connection is working${model}`);
  }
  return fail(REASON_MESSAGE[result.reason] ?? REASON_MESSAGE.unknown);
}

export async function disconnectAiProviderAction(provider: string) {
  const ctx = await withPermission("ai.providers.manage");
  if (!isAiProviderId(provider)) return fail("Unknown AI provider");
  await disconnectAiCredential(ctx.active.workspace.id, provider);
  revalidatePath("/settings/ai");
  return ok(undefined, "Disconnected");
}

export async function setDefaultAiProviderAction(provider: string) {
  const ctx = await withPermission("ai.providers.manage");
  if (!isAiProviderId(provider)) return fail("Unknown AI provider");
  const set = await setDefaultAiProvider(ctx.active.workspace.id, provider);
  if (!set) return fail("Connect this provider before making it the default");
  revalidatePath("/settings/ai");
  return ok(undefined, "Default AI provider updated");
}

