import { describe, it, expect } from "vitest";
import { startAuthorization, verifyState } from "./oauth";

// LinkedIn provider is unconfigured in tests → startAuthorization throws.
describe("startAuthorization", () => {
  it("refuses a platform with no configured OAuth app", () => {
    expect(() => startAuthorization("linkedin", "ws_1", "u_1")).toThrow(/not configured/i);
  });
});

describe("verifyState", () => {
  it("rejects undefined / malformed", () => {
    expect(verifyState(undefined)).toBeNull();
    expect(verifyState("no-dot")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    // hand-build a plausible-looking token; the HMAC won't match
    const body = Buffer.from(JSON.stringify({ platform: "x", exp: Date.now() + 1000 })).toString("base64url");
    expect(verifyState(`${body}.deadbeef`)).toBeNull();
  });
});

describe("pinterest oauth provider configuration", () => {
  it("uses Basic auth style for Pinterest API v5", async () => {
    const { PROVIDERS, oauthRedirectUri } = await import("./providers");
    const p = PROVIDERS.pinterest;
    expect(p).toBeDefined();
    if (!p) throw new Error("Pinterest provider not defined");
    expect(p.tokenAuthStyle).toBe("basic");
    expect(p.usePKCE).toBe(false);
    expect(p.scopes).toEqual(["boards:read", "boards:write", "pins:read", "pins:write", "user_accounts:read"]);
    expect(oauthRedirectUri("pinterest")).toMatch(/\/api\/oauth\/pinterest\/callback$/);
  });
});

