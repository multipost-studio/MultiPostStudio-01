import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isAllowedRedirectUri, isKnownClientUri, isValidChallenge, issuer, mcpUrl, newSecret, parseRegistration, pkceMatches, redirectHost, sha256Hex } from "./oauth";
import { ASSISTANT_SCOPES, READ_ONLY_SCOPES, SCOPE_INFO, parseScopeList } from "./scopes";

const verifier = "a".repeat(43);
const challengeOf = (v: string) => createHash("sha256").update(v).digest("base64url");

describe("PKCE", () => {
  it("accepts the verifier that hashes to the challenge", () => {
    expect(pkceMatches(verifier, challengeOf(verifier))).toBe(true);
  });
  it("rejects a different verifier, a short one, and non-strings", () => {
    expect(pkceMatches("b".repeat(43), challengeOf(verifier))).toBe(false);
    expect(pkceMatches("short", challengeOf("short"))).toBe(false);
    expect(pkceMatches(undefined, challengeOf(verifier))).toBe(false);
    expect(pkceMatches(verifier + "!", challengeOf(verifier))).toBe(false);
  });
  it("only accepts a 43-character base64url challenge", () => {
    expect(isValidChallenge(challengeOf(verifier))).toBe(true);
    expect(isValidChallenge(verifier)).toBe(true); // 43 url-safe characters is the right shape
    expect(isValidChallenge("short")).toBe(false);
    expect(isValidChallenge(`${verifier}=`)).toBe(false);
    expect(isValidChallenge(null)).toBe(false);
  });
});

describe("secrets", () => {
  it("makes unique, prefixed, URL-safe values and hashes them the same way every time", () => {
    const a = newSecret("mpo_");
    const b = newSecret("mpo_");
    expect(a).not.toBe(b);
    expect(a).toMatch(/^mpo_[A-Za-z0-9_-]{43}$/);
    expect(sha256Hex("x")).toBe(sha256Hex("x"));
    expect(sha256Hex("x")).toHaveLength(64);
  });
});

describe("redirect URIs", () => {
  it.each([
    "https://claude.ai/api/mcp/auth_callback",
    "https://chatgpt.com/connector_platform_oauth_redirect",
    "http://localhost:6274/oauth/callback",
    "http://127.0.0.1:33418/callback",
    "cursor://anysphere.cursor-mcp/oauth/callback",
  ])("allows %s", (uri) => expect(isAllowedRedirectUri(uri)).toBe(true));

  it.each([
    "http://evil.example/callback",
    "javascript:alert(1)",
    "data:text/html,hi",
    "file:///etc/passwd",
    "https://claude.ai/cb#fragment",
    "search-ms://query?x=1",
    "ms-msdt://id/x",
    "myapp://callback",
    "https://user:pw@claude.ai/cb",
    "/relative",
    "",
    "https://" + "a".repeat(300),
  ])("refuses %s", (uri) => expect(isAllowedRedirectUri(uri)).toBe(false));

  it("recognises the assistants we know, and flags the rest", () => {
    expect(isKnownClientUri("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(isKnownClientUri("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(isKnownClientUri("http://localhost:6274/cb")).toBe(true);
    expect(isKnownClientUri("cursor://anysphere.cursor-mcp/oauth/callback")).toBe(true);
    expect(isKnownClientUri("https://totally-new-ai.example/cb")).toBe(false);
    expect(isKnownClientUri("nonsense")).toBe(false);
  });

  it("names the host to show on the consent screen", () => {
    expect(redirectHost("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
    expect(redirectHost("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("anysphere.cursor-mcp");
  });
});

describe("client registration", () => {
  it("accepts a public client and tidies the name", () => {
    const r = parseRegistration({ redirect_uris: ["https://claude.ai/cb", "https://claude.ai/cb"], client_name: "  Claude\u0000  ", token_endpoint_auth_method: "none" });
    expect(r).toEqual({ ok: true, name: "Claude", redirectUris: ["https://claude.ai/cb"] });
  });
  it("falls back to a generic name", () => {
    expect(parseRegistration({ redirect_uris: ["https://a.example/cb"] })).toMatchObject({ ok: true, name: "AI assistant" });
  });
  it("refuses confidential clients, bad redirects, odd grants and non-objects", () => {
    expect(parseRegistration({ redirect_uris: ["https://a.example/cb"], token_endpoint_auth_method: "client_secret_post" })).toMatchObject({ ok: false });
    expect(parseRegistration({ redirect_uris: ["http://a.example/cb"] })).toMatchObject({ ok: false, error: "invalid_redirect_uri" });
    expect(parseRegistration({ redirect_uris: [] })).toMatchObject({ ok: false });
    expect(parseRegistration({ redirect_uris: Array(6).fill("https://a.example/cb") })).toMatchObject({ ok: false });
    expect(parseRegistration({ redirect_uris: ["https://a.example/cb"], grant_types: ["password"] })).toMatchObject({ ok: false });
    expect(parseRegistration(null)).toMatchObject({ ok: false });
    expect(parseRegistration([])).toMatchObject({ ok: false });
  });
});

describe("permissions", () => {
  it("pre-ticks only the read permissions", () => {
    expect(READ_ONLY_SCOPES.every((s) => !SCOPE_INFO[s].write)).toBe(true);
    expect(READ_ONLY_SCOPES).toContain("posts:read");
    expect(READ_ONLY_SCOPES).not.toContain("posts:write");
  });
  it("leaves the reserved permissions off the consent screen", () => {
    expect(ASSISTANT_SCOPES).not.toContain("media:write");
    expect(ASSISTANT_SCOPES).not.toContain("webhooks:manage");
  });
  it("keeps only known permissions, from a list or a space-separated string", () => {
    expect(parseScopeList("posts:read bogus posts:read ideas:write")).toEqual(["posts:read", "ideas:write"]);
    expect(parseScopeList(["posts:write", 5, "nope"])).toEqual(["posts:write"]);
    expect(parseScopeList(undefined)).toEqual([]);
  });
});

describe("advertised addresses", () => {
  it("has no trailing slash on the issuer, which clients compare character for character", () => {
    expect(issuer().endsWith("/")).toBe(false);
    expect(mcpUrl().endsWith("/api/mcp")).toBe(true);
  });
});
