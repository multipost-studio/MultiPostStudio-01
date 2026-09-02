import { describe, it, expect } from "vitest";
import { encryptToken, decryptToken, readToken, isRealToken } from "./crypto";

describe("token encryption", () => {
  it("round-trips", () => {
    const secret = "ya29.a0Afh-realish-access-token-value";
    const blob = encryptToken(secret);
    expect(blob).not.toContain(secret);
    expect(decryptToken(blob)).toBe(secret);
  });

  it("produces a different ciphertext each call (random IV)", () => {
    expect(encryptToken("x")).not.toBe(encryptToken("x"));
  });

  it("fails closed on a tampered blob", () => {
    const blob = encryptToken("hello");
    const bad = blob.slice(0, -4) + "AAAA";
    expect(() => decryptToken(bad)).toThrow();
  });
});

describe("readToken / isRealToken", () => {
  it("passes through legacy stub_ tokens", () => {
    expect(readToken("stub_abc123")).toBe("stub_abc123");
    expect(isRealToken("stub_abc123")).toBe(false);
  });

  it("decrypts real tokens and flags them real", () => {
    const enc = encryptToken("real-token");
    expect(readToken(enc)).toBe("real-token");
    expect(isRealToken(enc)).toBe(true);
  });

  it("null / garbage -> null / not real", () => {
    expect(readToken(null)).toBeNull();
    expect(readToken("not-base64-!@#")).toBeNull();
    expect(isRealToken(undefined)).toBe(false);
  });
});
