import { createHash, timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { rateLimit, rateLimitHeaders, retryAfterSec } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { planLimit } from "@/lib/entitlements";
import type { API_SCOPES } from "@/lib/constants";

export type ApiScope = (typeof API_SCOPES)[number];

export type ApiKeyContext = {
  keyId: string;
  orgId: string;
  scopes: ApiScope[];
  name: string;
};

export class ApiAuthError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterSec?: number,
    public rateLimitHeaders?: HeadersInit,
  ) {
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

  // Prefix lookup partition (60 bits: `mps_live_` + 15 hex). Keys minted
  // before the longer prefix fallback to their 16-char prefix below, so
  // rotation isn't forced — but handle P2002-style ambiguity by comparing
  // the full hash anyway (the prefix is only a partition key).
  const prefix = raw.slice(0, 24);
  let key = await db.apiKey.findUnique({ where: { prefix }, include: { org: { select: { deletedAt: true } } } });
  if (!key && raw.length >= 16) {
    key = await db.apiKey.findUnique({
      where: { prefix: raw.slice(0, 16) },
      include: { org: { select: { deletedAt: true } } },
    });
  }
  if (!key || key.revokedAt || key.org.deletedAt) {
    throw new ApiAuthError(401, "Invalid or revoked API key.");
  }

  // Suspended orgs keep their rows (and keys) but must stop serving: an org
  // with no active membership left is suspended (or mid-deletion) — its keys
  // 401 with the same uniform message as revoked ones.
  const activeMembers = await db.membership.count({ where: { orgId: key.orgId, status: "active" } });
  if (activeMembers === 0) {
    throw new ApiAuthError(401, "Invalid or revoked API key.");
  }

  // Constant-time compare of the sha256 digest.
  const got = createHash("sha256").update(raw).digest();
  const want = Buffer.from(key.hashedKey, "hex");
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    throw new ApiAuthError(401, "Invalid API key.");
  }

  // Per-plan rate limit (Plan.apiRateLimit: 0 = no API access, else req/min).
  // Falls back to 120/min if the plan lookup fails so a billing hiccup never
  // hard-blocks the API. Free/Pro catalog values are 0 → 403 below.
  let perMin = 120;
  try {
    const configured = await planLimit(key.orgId, "apiRateLimit");
    if (configured > 0) perMin = configured;
    else if (configured === 0) {
      throw new ApiAuthError(403, "API access is not included in your plan. Upgrade to use the public API.");
    }
  } catch (e) {
    if (e instanceof ApiAuthError) throw e;
    logger.warn({ err: e, orgId: key.orgId }, "api plan-limit lookup failed, using default 120/min");
  }
  const rl = await rateLimit(`apikey:${key.id}`, perMin, 60_000);
  if (!rl.ok) {
    throw new ApiAuthError(
      429,
      `Rate limit exceeded (${perMin} req/min per key).`,
      retryAfterSec(rl.resetAt),
      rateLimitHeaders(rl, perMin),
    );
  }

  const scopes = parseJson<ApiScope[]>(key.scopes, []);
  if (required && !scopes.includes(required)) {
    throw new ApiAuthError(403, `This key is missing the required scope: ${required}`);
  }

  // Sampled metering write: updating lastUsedAt on every call doubles write
  // load on the hot API path. 5% sampling keeps recency within minutes.
  if (Math.random() < 0.05) {
    db.apiKey
      .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => logger.warn({ err: e, keyId: key.id }, "apiKey lastUsedAt update failed"));
  }

  return { keyId: key.id, orgId: key.orgId, scopes, name: key.name };
}
