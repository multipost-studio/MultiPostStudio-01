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
