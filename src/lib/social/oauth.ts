import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuthSecret } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getProvider, oauthRedirectUri, type OAuthProvider } from "./providers";
import { encryptToken, decryptToken } from "./crypto";

/**
 * Generic OAuth2 (authorization-code, optional PKCE) connect flow.
 *
 *  start()    -> { redirectUrl, stateCookie }   (route sets the cookie, 302s)
 *  complete() -> upserts SocialAccount + SocialChannel with encrypted tokens
 *
 * State is a signed, self-contained token (no server session store):
 *   base64url(payloadJSON) + "." + hmacSHA256(payload, AUTH_SECRET)
 */

const STATE_TTL_MS = 10 * 60_000;
export const STATE_COOKIE = "mps_oauth_state";

type StatePayload = {
  platform: string;
  workspaceId: string;
  userId: string;
  nonce: string;
  verifier?: string; // PKCE
  exp: number;
};

function sign(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", requireAuthSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyState(token: string | undefined): StatePayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const expect = createHmac("sha256", requireAuthSecret()).update(body).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as StatePayload;
    return p.exp > Date.now() ? p : null;
  } catch {
    return null;
  }
}

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function startAuthorization(platform: string, workspaceId: string, userId: string) {
  const provider = getProvider(platform);
  if (!provider) throw new Error(`OAuth not configured for ${platform}`);

  const nonce = randomBytes(12).toString("hex");
  const pkce = provider.usePKCE ? pkcePair() : null;
  const state = sign({
    platform,
    workspaceId,
    userId,
    nonce,
    verifier: pkce?.verifier,
    exp: Date.now() + STATE_TTL_MS,
  });

  const u = new URL(provider.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", provider.clientId()!);
  u.searchParams.set("redirect_uri", oauthRedirectUri(platform));
  u.searchParams.set("scope", provider.scopes.join(provider.scopeSeparator ?? " "));
  u.searchParams.set("state", state);
  if (pkce) {
    u.searchParams.set("code_challenge", pkce.challenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(provider.authorizeExtras ?? {})) u.searchParams.set(k, v);

  return { redirectUrl: u.toString(), stateCookie: state };
}

async function exchangeCode(provider: OAuthProvider, code: string, verifier?: string) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: oauthRedirectUri(provider.key),
    client_id: provider.clientId()!,
  });
  if (verifier) form.set("code_verifier", verifier);

  // Public clients (X/PKCE) authenticate the secret via Basic; others send it in the body.
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (provider.usePKCE) {
    headers.authorization =
      "Basic " + Buffer.from(`${provider.clientId()}:${provider.clientSecret()}`).toString("base64");
  } else {
    form.set("client_secret", provider.clientSecret()!);
  }

  const res = await fetch(provider.tokenUrl, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
  }>;
}

export async function completeAuthorization(state: StatePayload, code: string) {
  const provider = getProvider(state.platform);
  if (!provider) throw new Error(`OAuth not configured for ${state.platform}`);

  const tokens = await exchangeCode(provider, code, state.verifier);

  // Provider-specific finalize runs first (Meta: long-lived + Page/IG token).
  // When it already resolves the account handle, its own errors are the
  // authoritative ones — skip identify(), which for Meta is a redundant probe
  // that throws a worse message.
  const fin = provider.finalize ? await provider.finalize(tokens.access_token) : null;

  const blank = { remoteId: "", handle: "", displayName: "", avatarUrl: undefined as string | undefined };
  const identity = fin?.handle ? blank : await provider.identify(tokens.access_token);

  const storedToken = fin?.accessToken ?? tokens.access_token;
  const expiresAt = fin
    ? fin.expiresAt
    : tokens.expires_in
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;
  const metadata = {
    ...(identity.remoteId ? { remoteId: identity.remoteId } : {}),
    ...(fin?.metadata ?? {}),
  };
  const handle = fin?.handle ?? identity.handle;
  const displayName = fin?.displayName ?? identity.displayName;
  const avatarUrl = fin?.avatarUrl ?? identity.avatarUrl ?? null;

  const existing = await db.socialAccount.findFirst({
    where: { workspaceId: state.workspaceId, platform: state.platform, handle },
  });

  const data = {
    workspaceId: state.workspaceId,
    platform: state.platform,
    displayName,
    handle,
    avatarUrl,
    status: "connected",
    accessToken: encryptToken(storedToken),
    refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    tokenExpiresAt: expiresAt,
    scopes: provider.scopes.join(","),
    metadata: JSON.stringify(metadata),
    lastSyncedAt: new Date(),
  };

  const account = existing
    ? await db.socialAccount.update({ where: { id: existing.id }, data })
    : await db.socialAccount.create({ data });

  const channel = await db.socialChannel.findFirst({ where: { socialAccountId: account.id } });
  if (!channel) {
    await db.socialChannel.create({
      data: {
        workspaceId: state.workspaceId,
        socialAccountId: account.id,
        platform: state.platform,
        name: displayName,
        handle,
        avatarUrl,
      },
    });
  }

  logger.info({ platform: state.platform, workspaceId: state.workspaceId, handle }, "social account connected via OAuth");
  return account;
}

/** Refresh an access token if it's within 2 minutes of expiry. Returns the usable token. */
export async function refreshIfNeeded(accountId: string): Promise<string | null> {
  const account = await db.socialAccount.findUnique({ where: { id: accountId } });
  if (!account?.accessToken) return null;

  const stillFresh = !account.tokenExpiresAt || account.tokenExpiresAt.getTime() - Date.now() > 120_000;
  if (stillFresh) return safeDecrypt(account.accessToken);

  const provider = getProvider(account.platform);
  if (!provider || !account.refreshToken) return safeDecrypt(account.accessToken);

  try {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptToken(account.refreshToken),
      client_id: provider.clientId()!,
    });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (provider.usePKCE) {
      headers.authorization =
        "Basic " + Buffer.from(`${provider.clientId()}:${provider.clientSecret()}`).toString("base64");
    } else {
      form.set("client_secret", provider.clientSecret()!);
    }
    const res = await fetch(provider.tokenUrl, { method: "POST", headers, body: form });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    await db.socialAccount.update({
      where: { id: accountId },
      data: {
        accessToken: encryptToken(t.access_token),
        refreshToken: t.refresh_token ? encryptToken(t.refresh_token) : account.refreshToken,
        tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
        status: "connected",
      },
    });
    return t.access_token;
  } catch (e) {
    logger.warn({ err: e, accountId, platform: account.platform }, "token refresh failed");
    await db.socialAccount.update({ where: { id: accountId }, data: { status: "expired" } });
    return null;
  }
}

function safeDecrypt(blob: string): string | null {
  try {
    return decryptToken(blob);
  } catch {
    return null;
  }
}
