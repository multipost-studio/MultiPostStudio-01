import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { encryptToken, decryptToken } from "@/lib/social/crypto";
import { getAiProviderAdapter, isAiProviderId } from "./providers/registry";
import type { AiProviderId, CredentialValidation } from "./providers/types";

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
  | { ok: false; reason: "invalid_key" | "unreachable" | "unknown" };

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

  const data = {
    workspaceId,
    provider,
    encryptedApiKey: encryptToken(trimmed),
    keyLast4: trimmed.slice(-4),
    status: "connected",
    defaultModel: adapter.defaultModel,
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

export async function testAiCredential(workspaceId: string, provider: string): Promise<CredentialValidation> {
  const resolved = await getAiCredential(workspaceId, provider);
  const adapter = getAiProviderAdapter(provider);
  if (!resolved || !adapter) return { ok: false, reason: "unknown" };
  const result = await adapter.validateCredentials(resolved.apiKey);
  await db.aiProviderCredential.update({
    where: { id: resolved.id },
    data: {
      status: result.ok ? "connected" : "invalid",
      lastValidatedAt: new Date(),
    },
  });
  return result;
}

/** Fire-and-forget — a missed lastUsedAt timestamp must never fail the AI call it's tracking. */
export function touchAiCredentialUsage(id: string): void {
  db.aiProviderCredential.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch((e) => {
    logger.warn({ err: e, id }, "failed to record AI credential usage timestamp");
  });
}
