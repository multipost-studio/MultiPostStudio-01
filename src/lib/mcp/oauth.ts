import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { appUrl } from "@/lib/env";

/** Lifetimes. A short access token limits what a leak is worth; the refresh token keeps an assistant connected without asking again. */
export const ACCESS_TTL_SEC = 60 * 60;
export const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;
/** A connection must be approved again at least this often, however often it refreshes. */
export const REFRESH_MAX_TOTAL_SEC = 180 * 24 * 60 * 60;
export const CODE_TTL_SEC = 5 * 60;
export const REQUEST_TTL_SEC = 15 * 60;

export const ACCESS_PREFIX = "mpo_";
export const REFRESH_PREFIX = "mpr_";
export const CLIENT_PREFIX = "mpc_";
export const CODE_PREFIX = "mpa_";

export const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

/** An unguessable value: `prefix` plus `bytes` random bytes, URL-safe. */
export function newSecret(prefix: string, bytes = 32): string {
  return prefix + randomBytes(bytes).toString("base64url");
}

/** The canonical addresses, from APP_URL. Never taken from request headers, so a spoofed Host cannot change what is advertised. */
export const issuer = () => appUrl().replace(/\/+$/, "");
export const mcpUrl = () => appUrl("/api/mcp");
export const resourceMetadataUrl = () => appUrl("/.well-known/oauth-protected-resource");

/** PKCE (RFC 7636), S256 only: the verifier the client sends at the token step must hash to the challenge it sent at the start. */
export function pkceMatches(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const got = Buffer.from(createHash("sha256").update(verifier).digest("base64url"));
  const want = Buffer.from(challenge);
  return got.length === want.length && timingSafeEqual(got, want);
}

/** A PKCE challenge is the base64url of a SHA-256 digest: exactly 43 characters. */
export const isValidChallenge = (c: unknown): c is string => typeof c === "string" && /^[A-Za-z0-9\-_]{43}$/.test(c);

const BAD_SCHEMES = new Set(["javascript:", "data:", "file:", "vbscript:", "blob:", "about:", "ftp:", "ws:", "wss:"]);

/** Desktop apps that open from a `scheme://` address. A short list on purpose: an arbitrary scheme could launch any program on a person's computer. */
export const APP_SCHEMES = ["cursor", "vscode", "vscode-insiders", "windsurf", "claude", "raycast"];

/** Hosts of assistants we recognise. Anything else still works, but the consent screen warns that it isn't one we know. */
const KNOWN_HOSTS = new Set(["claude.ai", "www.claude.ai", "claude.com", "www.claude.com", "chatgpt.com", "www.chatgpt.com", "chat.openai.com"]);

/**
 * Where a client may be sent back to. https anywhere; http only to this machine (desktop and CLI tools listen on localhost); and
 * the app schemes above. No fragments (RFC 6749), nothing script-like.
 */
export function isAllowedRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 300 || uri.length < 8) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  if (BAD_SCHEMES.has(u.protocol)) return false;
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
  return APP_SCHEMES.includes(u.protocol.slice(0, -1)) && uri.includes("://");
}

/** True for a return address on an assistant we recognise (or this machine, or a known desktop app). */
export function isKnownClientUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol === "https:") return KNOWN_HOSTS.has(u.hostname);
    if (u.protocol === "http:") return true; // already limited to this machine by isAllowedRedirectUri
    return APP_SCHEMES.includes(u.protocol.slice(0, -1));
  } catch {
    return false;
  }
}

export type Registration = { ok: true; name: string; redirectUris: string[] } | { ok: false; error: string; description: string };

/** Validate a dynamic client registration request (RFC 7591). Only public clients using PKCE are supported. */
export function parseRegistration(body: unknown): Registration {
  const bad = (description: string, error = "invalid_client_metadata"): Registration => ({ ok: false, error, description });
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad("The request body must be a JSON object.");
  const b = body as Record<string, unknown>;
  const uris = b.redirect_uris;
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > 5) return bad("redirect_uris must list 1 to 5 addresses.", "invalid_redirect_uri");
  if (!uris.every(isAllowedRedirectUri)) return bad("Each redirect URI must be https, a localhost address, or a supported app scheme, with no fragment.", "invalid_redirect_uri");
  const method = b.token_endpoint_auth_method;
  if (method !== undefined && method !== "none") return bad('Only public clients are supported: token_endpoint_auth_method must be "none".');
  const grants = b.grant_types;
  if (grants !== undefined && (!Array.isArray(grants) || !grants.every((g) => g === "authorization_code" || g === "refresh_token"))) {
    return bad("grant_types may only be authorization_code and refresh_token.");
  }
  const name = (typeof b.client_name === "string" ? b.client_name : "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80);
  return { ok: true, name: name || "AI assistant", redirectUris: [...new Set(uris as string[])] };
}

/** A host name for the consent screen, so the person sees where they will be sent back to. */
export function redirectHost(uri: string): string {
  try {
    const u = new URL(uri);
    return u.host || u.protocol.replace(":", "");
  } catch {
    return "unknown";
  }
}
