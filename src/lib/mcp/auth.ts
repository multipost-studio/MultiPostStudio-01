import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { parseJson } from "@/lib/utils";
import { hasEntitlement, planLimit } from "@/lib/entitlements";
import { rateLimit, rateLimitHeaders, retryAfterSec } from "@/lib/rate-limit";
import { authenticateApiKey, ApiAuthError, type ApiKeyContext, type ApiScope } from "@/lib/api/auth";
import { grantStillAllowed } from "./grant";
import { ACCESS_PREFIX, sha256Hex } from "./oauth";

/** Who is calling the MCP endpoint: an API key (the whole org) or an OAuth connection (one workspace or all, chosen by the person). */
export type McpContext = ApiKeyContext & {
  via: "key" | "oauth";
  /** null = every workspace of the org. Only an OAuth connection can be narrowed to one. */
  workspaceId: string | null;
  /** The person who approved an OAuth connection. Null for API keys. */
  userId: string | null;
  /** Shown in the activity log: the key's name or the assistant's name. */
  client: string;
};

export class McpAuthError extends Error {
  constructor(
    public status: 401 | 403 | 429,
    message: string,
    public headers?: HeadersInit,
    public invalidToken = false,
  ) {
    super(message);
    this.name = "McpAuthError";
  }
}

const bearer = (req: NextRequest) => /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")?.[1]?.trim() ?? null;

/**
 * Authenticate an MCP request. API keys (`mps_…`) go through exactly the checks the public API applies (plan, rate limit, revocation);
 * OAuth access tokens (`mpo_…`) are checked here. Anything else is a 401, which tells the client to start the OAuth sign-in.
 */
export async function authenticateMcp(req: NextRequest): Promise<McpContext> {
  const raw = bearer(req);
  if (!raw) throw new McpAuthError(401, "Authentication required.");

  if (raw.startsWith("mps_")) {
    try {
      const ctx = await authenticateApiKey(req);
      return { ...ctx, via: "key", workspaceId: null, userId: null, client: ctx.name };
    } catch (e) {
      if (e instanceof ApiAuthError) {
        throw new McpAuthError(e.status === 429 ? 429 : e.status === 403 ? 403 : 401, e.message, e.rateLimitHeaders, e.status === 401);
      }
      throw e;
    }
  }

  if (!raw.startsWith(ACCESS_PREFIX)) throw new McpAuthError(401, "Unrecognised credential.", undefined, true);

  const token = await db.oAuthToken.findUnique({
    where: { accessHash: sha256Hex(raw) },
    include: { client: { select: { name: true } }, org: { select: { deletedAt: true } } },
  });
  if (!token || token.revokedAt || token.org.deletedAt || token.accessExpiresAt.getTime() <= Date.now()) {
    throw new McpAuthError(401, "The access token is invalid, expired or revoked.", undefined, true);
  }
  // The connection belongs to the person who approved it, and only lasts while they could still approve it: leaving the
  // organisation, being suspended, being demoted or losing the one workspace it was limited to all end it.
  if (!(await grantStillAllowed(token))) throw new McpAuthError(401, "The access token is invalid, expired or revoked.", undefined, true);

  if (!(await hasEntitlement(token.orgId, "api_access"))) {
    throw new McpAuthError(403, "AI assistant access is not included in your plan. Upgrade to use it.");
  }
  let perMin = 120;
  try {
    const configured = await planLimit(token.orgId, "apiRateLimit");
    if (configured > 0) perMin = configured;
  } catch (e) {
    logger.warn({ err: e, orgId: token.orgId }, "mcp plan-limit lookup failed, using default 120/min");
  }
  const rl = await rateLimit(`mcp:${token.id}`, perMin, 60_000);
  if (!rl.ok) {
    throw new McpAuthError(429, `Rate limit exceeded (${perMin} requests per minute).`, { ...rateLimitHeaders(rl, perMin), "Retry-After": String(retryAfterSec(rl.resetAt)) });
  }

  if (Math.random() < 0.1) {
    db.oAuthToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch((e) => logger.warn({ err: e, tokenId: token.id }, "oauth token lastUsedAt update failed"));
  }

  return {
    keyId: `oauth:${token.id}`,
    orgId: token.orgId,
    scopes: parseJson<ApiScope[]>(token.scopes, []),
    name: token.client.name,
    via: "oauth",
    workspaceId: token.workspaceId,
    userId: token.userId,
    client: token.client.name,
  };
}
