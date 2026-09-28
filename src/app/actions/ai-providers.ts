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
  if (result.ok) return ok(undefined, "Connection is working");
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

