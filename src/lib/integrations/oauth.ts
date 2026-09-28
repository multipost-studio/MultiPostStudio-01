import { createHmac, randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { requireAuthSecret } from "@/lib/env";
import { logger } from "@/lib/logger";
import { encryptToken, decryptToken } from "@/lib/social/crypto";
import { getIntegrationProvider, integrationRedirectUri, type IntegrationProvider } from "./providers";

/**
 * OAuth2 authorization-code flow for file-source integrations (Google Drive
 * today; Dropbox/OneDrive/Canva later). Mirrors src/lib/social/oauth.ts's
 * state-signing and token-exchange mechanics but persists into
 * ConnectedIntegration instead of SocialAccount — these connections carry no
 * publish semantics.
 */

const STATE_TTL_MS = 10 * 60_000;
export const INTEGRATION_STATE_COOKIE = "mps_int_oauth_state";

type StatePayload = { provider: string; workspaceId: string; userId: string; nonce: string; verifier?: string; exp: number };

function pkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

function sign(payload: StatePayload): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const mac = createHmac("sha256", requireAuthSecret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function verifyIntegrationState(token: string | undefined): StatePayload | null {
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

export function startIntegrationAuthorization(provider: string, workspaceId: string, userId: string) {
  const p = getIntegrationProvider(provider);
  if (!p) throw new Error(`Integration not configured: ${provider}`);
  const pkce = p.usePKCE ? pkcePair() : null;
  const state = sign({
    provider,
    workspaceId,
    userId,
    nonce: randomBytes(12).toString("hex"),
    verifier: pkce?.verifier,
    exp: Date.now() + STATE_TTL_MS,
  });

  const u = new URL(p.authorizeUrl);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId()!);
  u.searchParams.set("redirect_uri", integrationRedirectUri(provider));
  u.searchParams.set("scope", p.scopes.join(" "));
  u.searchParams.set("state", state);
  if (pkce) {
    u.searchParams.set("code_challenge", pkce.challenge);
    u.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(p.authorizeExtras ?? {})) u.searchParams.set(k, v);

  return { redirectUrl: u.toString(), stateCookie: state };
}

async function exchangeCode(p: IntegrationProvider, code: string, verifier?: string) {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: integrationRedirectUri(p.key),
  });
  // PKCE providers (Canva) authenticate with Basic auth and add
  // code_verifier; every other provider here keeps the original body-secret
  // method unchanged.
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (p.usePKCE) {
    form.set("code_verifier", verifier ?? "");
    headers.authorization = "Basic " + Buffer.from(`${p.clientId()}:${p.clientSecret()}`).toString("base64");
  } else {
    form.set("client_id", p.clientId()!);
    form.set("client_secret", p.clientSecret()!);
  }
  const res = await fetch(p.tokenUrl, { method: "POST", headers, body: form });
  if (!res.ok) throw new Error(`token exchange failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{ access_token: string; refresh_token?: string; expires_in?: number }>;
}

export async function completeIntegrationAuthorization(state: StatePayload, code: string) {
  const p = getIntegrationProvider(state.provider);
  if (!p) throw new Error(`Integration not configured: ${state.provider}`);

  const tokens = await exchangeCode(p, code, state.verifier);
  const identity = await p.identify(tokens.access_token);

  const data = {
    workspaceId: state.workspaceId,
    provider: state.provider,
    displayName: identity.displayName,
    accountEmail: identity.accountEmail ?? null,
    status: "connected",
    accessToken: encryptToken(tokens.access_token),
    refreshToken: tokens.refresh_token ? encryptToken(tokens.refresh_token) : null,
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    scopes: p.scopes.join(","),
    lastSyncedAt: new Date(),
  };

  const account = await db.connectedIntegration.upsert({
    where: { workspaceId_provider: { workspaceId: state.workspaceId, provider: state.provider } },
    create: data,
    update: data,
  });

  logger.info({ provider: state.provider, workspaceId: state.workspaceId }, "integration connected via OAuth");
  return account;
}

/** Refresh an access token if it's within 2 minutes of expiry. Returns the usable token. */
export async function refreshIntegrationIfNeeded(id: string): Promise<string | null> {
  const account = await db.connectedIntegration.findUnique({ where: { id } });
  if (!account?.accessToken) return null;

  const stillFresh = !account.tokenExpiresAt || account.tokenExpiresAt.getTime() - Date.now() > 120_000;
  if (stillFresh) return safeDecrypt(account.accessToken);

  const p = getIntegrationProvider(account.provider);
  if (!p || !account.refreshToken) return safeDecrypt(account.accessToken);

  try {
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decryptToken(account.refreshToken),
    });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
    if (p.usePKCE) {
      headers.authorization = "Basic " + Buffer.from(`${p.clientId()}:${p.clientSecret()}`).toString("base64");
    } else {
      form.set("client_id", p.clientId()!);
      form.set("client_secret", p.clientSecret()!);
    }
    const res = await fetch(p.tokenUrl, { method: "POST", headers, body: form });
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    const t = (await res.json()) as { access_token: string; refresh_token?: string; expires_in?: number };
    await db.connectedIntegration.update({
      where: { id },
      data: {
        accessToken: encryptToken(t.access_token),
        refreshToken: t.refresh_token ? encryptToken(t.refresh_token) : account.refreshToken,
        tokenExpiresAt: t.expires_in ? new Date(Date.now() + t.expires_in * 1000) : null,
        status: "connected",
      },
    });
    return t.access_token;
  } catch (e) {
    logger.warn({ err: e, id, provider: account.provider }, "integration token refresh failed");
    await db.connectedIntegration.update({ where: { id }, data: { status: "expired" } });
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

/**
 * Best-effort provider-side revocation on disconnect — see
 * lib/social/oauth.ts's revokeAtProvider for the full rationale. Never
 * throws; a failed/unreachable revoke must not block disconnecting in our
 * own app.
 */
export async function revokeIntegrationAtProvider(provider: string, accessToken: string | null): Promise<void> {
  if (!accessToken) return;
  try {
    if (provider === "google_drive" || provider === "google_photos") {
      await fetch("https://oauth2.googleapis.com/revoke", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: accessToken }),
      });
    } else if (provider === "dropbox") {
      await fetch("https://api.dropboxapi.com/2/auth/token/revoke", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } else if (provider === "canva") {
      const p = getIntegrationProvider("canva");
      if (p) {
        await fetch("https://api.canva.com/rest/v1/oauth/revoke", {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            authorization: "Basic " + Buffer.from(`${p.clientId()}:${p.clientSecret()}`).toString("base64"),
          },
          body: new URLSearchParams({ token: accessToken }),
        });
      }
    }
    // onedrive: Microsoft Graph has no per-app token revoke — the closest
    // (revokeSignInSessions) kills the user's sessions across every app, not
    // just this integration, so it's too broad to call from a "disconnect
    // this one integration" action. Local-only removal, same as LinkedIn and
    // Pinterest in lib/social/oauth.ts.
  } catch (e) {
    logger.warn({ err: e, provider }, "provider-side token revocation failed (non-fatal, disconnect proceeds)");
  }
}
