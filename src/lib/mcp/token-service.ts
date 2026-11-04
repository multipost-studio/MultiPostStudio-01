import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { grantStillAllowed } from "./grant";
import { ACCESS_PREFIX, ACCESS_TTL_SEC, REFRESH_MAX_TOTAL_SEC, REFRESH_PREFIX, REFRESH_TTL_SEC, newSecret, pkceMatches, sha256Hex } from "./oauth";

export type TokenOutcome = { status: number; body: Record<string, unknown> };

const err = (error: string, description: string, status = 400): TokenOutcome => ({ status, body: { error, error_description: description } });

const grant = (description = "The code or refresh token is invalid, expired or already used.") => err("invalid_grant", description);

const field = (p: URLSearchParams, k: string) => {
  const v = p.get(k);
  return v && v.length <= 2000 ? v : null;
};

function issued(access: string, refresh: string, scopes: string[]): TokenOutcome {
  return {
    status: 200,
    body: { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: refresh, scope: scopes.join(" ") },
  };
}

/**
 * The OAuth token endpoint (RFC 6749 sections 4.1.3 and 6) for public clients using PKCE. A code works once; a refresh token works
 * once and is replaced by a new one each time, so a stolen copy stops working as soon as the real client refreshes.
 */
export async function handleTokenRequest(p: URLSearchParams, now = new Date()): Promise<TokenOutcome> {
  const grantType = field(p, "grant_type");
  const clientId = field(p, "client_id");
  if (!grantType) return err("invalid_request", "grant_type is required.");
  if (!clientId) return err("invalid_request", "client_id is required.");

  if (grantType === "authorization_code") {
    const code = field(p, "code");
    const verifier = field(p, "code_verifier");
    const redirectUri = field(p, "redirect_uri");
    if (!code || !verifier || !redirectUri) return err("invalid_request", "code, code_verifier and redirect_uri are required.");

    const row = await db.oAuthAuthRequest.findUnique({ where: { codeHash: sha256Hex(code) } });
    if (row && row.clientId === clientId && row.usedAt && row.userId && row.orgId) {
      // A code presented a second time: someone other than the app may hold it. End whatever it was already traded for (RFC 6749 4.1.2).
      await db.oAuthToken.updateMany({
        where: { clientId, userId: row.userId, orgId: row.orgId, revokedAt: null, createdAt: { gte: new Date(row.usedAt.getTime() - 60_000) } },
        data: { revokedAt: now },
      });
      return grant();
    }
    if (!row || row.clientId !== clientId || row.usedAt || !row.codeExpiresAt || row.codeExpiresAt <= now) return grant();
    if (row.redirectUri !== redirectUri) return grant("redirect_uri doesn't match the authorization request.");
    if (!pkceMatches(verifier, row.codeChallenge)) return grant("code_verifier doesn't match the code_challenge.");
    if (!row.userId || !row.orgId || !row.grantedScopes) return grant();

    // Claim the code before issuing anything: two simultaneous exchanges can't both win.
    const claimed = await db.oAuthAuthRequest.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: now } });
    if (claimed.count !== 1) return grant();

    const scopes = parseJson<string[]>(row.grantedScopes, []);
    const access = newSecret(ACCESS_PREFIX);
    const refresh = newSecret(REFRESH_PREFIX);
    await db.oAuthToken.create({
      data: {
        clientId,
        userId: row.userId,
        orgId: row.orgId,
        workspaceId: row.workspaceId,
        scopes: JSON.stringify(scopes),
        accessHash: sha256Hex(access),
        refreshHash: sha256Hex(refresh),
        accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_SEC * 1000),
        refreshExpiresAt: new Date(now.getTime() + REFRESH_TTL_SEC * 1000),
      },
    });
    return issued(access, refresh, scopes);
  }

  if (grantType === "refresh_token") {
    const refreshToken = field(p, "refresh_token");
    if (!refreshToken) return err("invalid_request", "refresh_token is required.");
    const oldHash = sha256Hex(refreshToken);
    const token = await db.oAuthToken.findUnique({ where: { refreshHash: oldHash } });
    if (!token) {
      // An old refresh token that was already replaced: the real app moved on, so this is a copy. Cut the whole connection off.
      const stale = await db.oAuthToken.findFirst({ where: { prevRefreshHash: oldHash, clientId } });
      if (stale) await db.oAuthToken.updateMany({ where: { id: stale.id }, data: { revokedAt: now } });
      return grant();
    }
    if (token.clientId !== clientId || token.revokedAt || token.refreshExpiresAt <= now) return grant();
    // Only while the person who approved it could still approve it.
    if (!(await grantStillAllowed(token))) {
      await db.oAuthToken.updateMany({ where: { id: token.id }, data: { revokedAt: now } });
      return grant();
    }

    const access = newSecret(ACCESS_PREFIX);
    const refresh = newSecret(REFRESH_PREFIX);
    // Swap only if the refresh token is still the one we just read: a second, simultaneous refresh finds it already replaced.
    const swapped = await db.oAuthToken.updateMany({
      where: { id: token.id, refreshHash: oldHash, revokedAt: null },
      data: {
        accessHash: sha256Hex(access),
        refreshHash: sha256Hex(refresh),
        prevRefreshHash: oldHash,
        accessExpiresAt: new Date(now.getTime() + ACCESS_TTL_SEC * 1000),
        // Sliding, but never past an absolute limit: a connection must be approved again every few months.
        refreshExpiresAt: new Date(Math.min(now.getTime() + REFRESH_TTL_SEC * 1000, token.createdAt.getTime() + REFRESH_MAX_TOTAL_SEC * 1000)),
      },
    });
    if (swapped.count !== 1) return grant();
    return issued(access, refresh, parseJson<string[]>(token.scopes, []));
  }

  return err("unsupported_grant_type", "Only authorization_code and refresh_token are supported.");
}

/** RFC 7009: revoke the connection a token belongs to. Says nothing about whether the token existed. */
export async function revokeToken(value: string): Promise<void> {
  if (!value || value.length > 2000) return;
  const h = sha256Hex(value);
  await db.oAuthToken.updateMany({ where: { OR: [{ accessHash: h }, { refreshHash: h }], revokedAt: null }, data: { revokedAt: new Date() } });
}
