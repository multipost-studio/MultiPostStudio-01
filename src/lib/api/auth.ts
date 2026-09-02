import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import type { API_SCOPES } from "@/lib/constants";

export type ApiScope = (typeof API_SCOPES)[number];

export type ApiKeyContext = {
  keyId: string;
  orgId: string;
  scopes: ApiScope[];
  name: string;
};

export class ApiAuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
  }
}

function bearer(req: NextRequest): string | null {
  const h = req.headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

/**
 * Authenticate a public-API request by its `mps_live_…` key.
 * Throws ApiAuthError (401/403/429) on any failure. On success returns the
 * key's org + granted scopes and updates lastUsedAt (fire-and-forget).
 */
export async function authenticateApiKey(req: NextRequest, required?: ApiScope): Promise<ApiKeyContext> {
  const raw = bearer(req);
  if (!raw || !raw.startsWith("mps_")) {
    throw new ApiAuthError(401, "Missing or malformed API key. Send `Authorization: Bearer mps_live_…`.");
  }

  const prefix = raw.slice(0, 16);
  const key = await db.apiKey.findUnique({ where: { prefix } });
  if (!key || key.revokedAt) {
    throw new ApiAuthError(401, "Invalid or revoked API key.");
  }

  // Constant-time compare of the sha256 digest.
  const got = createHash("sha256").update(raw).digest();
  const want = Buffer.from(key.hashedKey, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    throw new ApiAuthError(401, "Invalid API key.");
  }

  // Per-key rate limit: 120 requests / minute.
  const rl = await rateLimit(`apikey:${key.id}`, 120, 60_000);
  if (!rl.ok) {
    throw new ApiAuthError(429, "Rate limit exceeded (120 req/min per key).");
  }

  const scopes = parseJson<ApiScope[]>(key.scopes, []);
  if (required && !scopes.includes(required)) {
    throw new ApiAuthError(403, `This key is missing the required scope: ${required}`);
  }

  db.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch((e) => logger.warn({ err: e, keyId: key.id }, "apiKey lastUsedAt update failed"));

  return { keyId: key.id, orgId: key.orgId, scopes, name: key.name };
}
