import { db } from "@/lib/db";
import { appUrl } from "@/lib/env";
import { parseJson } from "@/lib/utils";
import { isValidChallenge, mcpUrl, newSecret, REQUEST_TTL_SEC } from "./oauth";
import { parseScopeList } from "./scopes";

export type AuthorizeOutcome = { kind: "page-error"; message: string } | { kind: "redirect"; location: string };

const sameResource = (r: string) => r.replace(/\/+$/, "") === mcpUrl().replace(/\/+$/, "");

/** Send an OAuth error back to the client's own redirect address (never for a bad client or redirect, which must not redirect at all). */
function backToClient(redirectUri: string, state: string | null, error: string, description: string): AuthorizeOutcome {
  const u = new URL(redirectUri);
  u.searchParams.set("error", error);
  u.searchParams.set("error_description", description);
  if (state) u.searchParams.set("state", state);
  return { kind: "redirect", location: u.toString() };
}

/**
 * The first step of connecting an assistant (RFC 6749 section 4.1.1). Checks the request, records it, and sends the browser to our own
 * consent screen with one opaque id: the sign-in redirect can't lose or garble the parameters, because it only carries that id.
 */
export async function startAuthorization(q: URLSearchParams): Promise<AuthorizeOutcome> {
  const clientId = q.get("client_id") ?? "";
  const redirectUri = q.get("redirect_uri") ?? "";
  const client = clientId && clientId.length <= 100 ? await db.oAuthClient.findUnique({ where: { id: clientId } }) : null;
  if (!client) return { kind: "page-error", message: "This app isn't registered, so it can't be connected. Ask it to register again." };
  if (!redirectUri || !parseJson<string[]>(client.redirectUris, []).includes(redirectUri)) {
    return { kind: "page-error", message: "The return address in this request isn't one the app registered." };
  }

  const state = q.get("state")?.slice(0, 500) || null;
  if (q.get("response_type") !== "code") return backToClient(redirectUri, state, "unsupported_response_type", "Only response_type=code is supported.");
  const challenge = q.get("code_challenge");
  if (!isValidChallenge(challenge) || q.get("code_challenge_method") !== "S256") {
    return backToClient(redirectUri, state, "invalid_request", "PKCE with code_challenge_method=S256 is required.");
  }
  const resource = q.get("resource");
  if (resource && !sameResource(resource)) return backToClient(redirectUri, state, "invalid_target", "Unknown resource.");

  const row = await db.oAuthAuthRequest.create({
    data: {
      id: newSecret("mpq_", 24),
      clientId: client.id,
      redirectUri,
      codeChallenge: challenge,
      state,
      scopes: JSON.stringify(parseScopeList(q.get("scope"))),
      expiresAt: new Date(Date.now() + REQUEST_TTL_SEC * 1000),
    },
    select: { id: true },
  });
  return { kind: "redirect", location: appUrl(`/connect/authorize?request=${encodeURIComponent(row.id)}`) };
}
