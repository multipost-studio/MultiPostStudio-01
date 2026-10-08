import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { encryptToken, decryptToken } from "@/lib/social/crypto";
import { getAiProviderAdapter, isAiProviderId } from "./providers/registry";
import { discoverModel, resolveModel } from "./model-resolution";
import { classifyProviderError, type AiFailureReason } from "./models";
import type { AiProviderAdapter, AiProviderId, CredentialValidation } from "./providers/types";

/** Safe to hand to a client component — no key material. */
export type AiCredentialSummary = {
  id: string;
  provider: AiProviderId;
  status: string;
  keyLast4: string;
  defaultModel: string | null;
  lastValidatedAt: Date | null;
  lastUsedAt: Date | null;
};

const SUMMARY_SELECT = {
  id: true,
  provider: true,
  status: true,
  keyLast4: true,
  defaultModel: true,
  lastValidatedAt: true,
  lastUsedAt: true,
} as const;

export async function listAiCredentials(workspaceId: string): Promise<AiCredentialSummary[]> {
  const rows = await db.aiProviderCredential.findMany({
    where: { workspaceId },
    select: SUMMARY_SELECT,
    orderBy: { createdAt: "asc" },
  });
  return rows as AiCredentialSummary[];
}

/**
 * Decrypted credential for internal use only (the orchestrator's provider
 * call). Never return this — or anything derived from `apiKey` — from a
 * server action; actions must use listAiCredentials/AiCredentialSummary.
 */
export type ResolvedAiCredential = { id: string; provider: AiProviderId; apiKey: string; model: string };

/** The workspace's chosen default provider's live, decrypted credential — or null if none is connected/selected. */
export async function getDefaultAiCredential(workspaceId: string): Promise<ResolvedAiCredential | null> {
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { defaultAiProvider: true } });
  if (!ws?.defaultAiProvider) return null;
  return getAiCredential(workspaceId, ws.defaultAiProvider);
}

export async function getAiCredential(workspaceId: string, provider: string): Promise<ResolvedAiCredential | null> {
  if (!isAiProviderId(provider)) return null;
  const row = await db.aiProviderCredential.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
  });
  if (!row || row.status !== "connected") return null;
  try {
    const apiKey = decryptToken(row.encryptedApiKey);
    const adapter = getAiProviderAdapter(provider);
    return { id: row.id, provider, apiKey, model: row.defaultModel || adapter?.defaultModel || "" };
  } catch (e) {
    // A corrupt single row must read as "not usable", not crash the caller —
    // same reasoning as readToken() in lib/social/crypto.ts.
    logger.error({ err: e, workspaceId, provider }, "failed to decrypt AI provider credential");
    return null;
  }
}

export type ConnectResult =
  | { ok: true; summary: AiCredentialSummary }
  | { ok: false; reason: Exclude<CredentialValidation, { ok: true }>["reason"] };

export async function connectAiCredential(
  workspaceId: string,
  userId: string,
  provider: string,
  apiKey: string,
): Promise<ConnectResult> {
  if (!isAiProviderId(provider)) return { ok: false, reason: "unknown" };
  const adapter = getAiProviderAdapter(provider);
  if (!adapter) return { ok: false, reason: "unknown" };

  const trimmed = apiKey.trim();
  const validation = await adapter.validateCredentials(trimmed);
  if (!validation.ok) return { ok: false, reason: validation.reason };
  // Ask the provider what this key can use instead of trusting a model id we typed months ago.
  const model = await resolveModel(adapter, trimmed);

  const data = {
    workspaceId,
    provider,
    encryptedApiKey: encryptToken(trimmed),
    keyLast4: trimmed.slice(-4),
    status: "connected",
    defaultModel: model,
    connectedById: userId,
    lastValidatedAt: new Date(),
  };
  const row = await db.aiProviderCredential.upsert({
    where: { workspaceId_provider: { workspaceId, provider } },
    create: data,
    update: {
      encryptedApiKey: data.encryptedApiKey,
      keyLast4: data.keyLast4,
      status: "connected",
      defaultModel: model,
      connectedById: userId,
      lastValidatedAt: data.lastValidatedAt,
    },
    select: SUMMARY_SELECT,
  });

  // First connected provider becomes the default automatically so a
  // single-provider workspace works without an extra "set default" step.
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { defaultAiProvider: true } });
  if (!ws?.defaultAiProvider) {
    await db.workspace.update({ where: { id: workspaceId }, data: { defaultAiProvider: provider } });
  }

  logger.info({ workspaceId, provider }, "AI provider connected");
  return { ok: true, summary: row as AiCredentialSummary };
}

export async function disconnectAiCredential(workspaceId: string, provider: string): Promise<void> {
  await db.aiProviderCredential.deleteMany({ where: { workspaceId, provider } });
  const ws = await db.workspace.findUnique({ where: { id: workspaceId }, select: { defaultAiProvider: true } });
  if (ws?.defaultAiProvider === provider) {
    const next = await db.aiProviderCredential.findFirst({ where: { workspaceId }, select: { provider: true } });
    await db.workspace.update({ where: { id: workspaceId }, data: { defaultAiProvider: next?.provider ?? null } });
  }
  logger.info({ workspaceId, provider }, "AI provider disconnected");
}

export async function setDefaultAiProvider(workspaceId: string, provider: string): Promise<boolean> {
  const connected = await db.aiProviderCredential.findUnique({
    where: { workspaceId_provider: { workspaceId, provider } },
    select: { status: true },
  });
  if (!connected || connected.status !== "connected") return false;
  await db.workspace.update({ where: { id: workspaceId }, data: { defaultAiProvider: provider } });
  return true;
}

export type AiTestResult = CredentialValidation & { model?: string; healed?: boolean };

const PING_TIMEOUT_MS = 20_000;

/** One real, tiny generation. Resolves to null when it worked, else why it did not. */
async function tryPing(adapter: AiProviderAdapter, apiKey: string, model: string): Promise<AiFailureReason | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
  try {
    const res = await adapter.generateText({
      system: "You are a connectivity check. Answer with one word.",
      user: "Reply with the single word OK.",
      maxTokens: 16,
      apiKey,
      model,
      signal: ctrl.signal,
    });
    return res.text.trim() ? null : "provider_error";
  } catch (e) {
    return classifyProviderError(e);
  } finally {
    clearTimeout(timer);
  }
}

const toValidationReason = (r: AiFailureReason): "invalid_key" | "unreachable" | "unknown" | "quota" | "model_unavailable" => (r === "provider_error" ? "unknown" : r);

/**
 * The model this credential should use if its stored one has been retired: ask the
 * provider again and, if the answer differs, remember it. Returns the new model or null.
 */
export async function healCredentialModel(credential: ResolvedAiCredential): Promise<string | null> {
  const adapter = getAiProviderAdapter(credential.provider);
  if (!adapter) return null;
  const next = await discoverModel(adapter, credential.apiKey);
  if (!next || next === credential.model) return null;
  await db.aiProviderCredential.update({ where: { id: credential.id }, data: { defaultModel: next } });
  logger.info({ provider: credential.provider, from: credential.model, to: next }, "AI model re-resolved after the stored one stopped working");
  return next;
}

async function markInvalid(id: string): Promise<void> {
  await db.aiProviderCredential.update({ where: { id }, data: { status: "invalid", lastValidatedAt: new Date() } });
}

/**
 * "Test Connection": proves the key authenticates AND that a real generation works
 * with the stored model. If the model was retired it is re-picked from what the
 * provider offers today and the test retried once, so the button fixes the problem
 * it would otherwise only report. A rejected key marks the credential invalid; a
 * quota or network problem does not (the key itself is fine).
 */
export async function testAiCredential(workspaceId: string, provider: string): Promise<AiTestResult> {
  const resolved = await getAiCredential(workspaceId, provider);
  const adapter = getAiProviderAdapter(provider);
  if (!resolved || !adapter) return { ok: false, reason: "unknown" };

  const auth = await adapter.validateCredentials(resolved.apiKey);
  if (!auth.ok) {
    if (auth.reason === "invalid_key") await markInvalid(resolved.id);
    return auth;
  }

  let model = resolved.model;
  let healed = false;
  let failure = await tryPing(adapter, resolved.apiKey, model);
  if (failure === "model_unavailable") {
    const next = await healCredentialModel(resolved);
    if (next) {
      failure = await tryPing(adapter, resolved.apiKey, next);
      if (!failure) {
        model = next;
        healed = true;
      }
    }
  }
  if (failure) {
    if (failure === "invalid_key") await markInvalid(resolved.id);
    return { ok: false, reason: toValidationReason(failure) };
  }

  await db.aiProviderCredential.update({ where: { id: resolved.id }, data: { status: "connected", lastValidatedAt: new Date() } });
  return { ok: true, model, healed };
}

/** Fire-and-forget — a missed lastUsedAt timestamp must never fail the AI call it's tracking. */
export function touchAiCredentialUsage(id: string): void {
  db.aiProviderCredential.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch((e) => {
    logger.warn({ err: e, id }, "failed to record AI credential usage timestamp");
  });
}
