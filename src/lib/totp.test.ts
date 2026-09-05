import { describe, it, expect, vi, afterEach } from "vitest";
import { generateTotpSecret, verifyTotpCode, totpUri, hotp, base32Encode, base32Decode } from "./totp";

describe("totp", () => {
  afterEach(() => vi.restoreAllMocks());

  // RFC 4226 Appendix D test vectors — the ASCII string "12345678901234567890"
  // used directly as the HMAC key (no base32 involved), counters 0-9.
  it("matches the RFC 4226 HOTP test vectors", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    const expected = [
      "755224", "287082", "359152", "969429", "338314",
      "254676", "287922", "162583", "399871", "520489",
    ];
    expected.forEach((code, counter) => {
      expect(hotp(key, counter)).toBe(code);
    });
  });

  it("base32 encode/decode round-trips arbitrary bytes", () => {
    const original = Buffer.from("12345678901234567890", "ascii");
    expect(base32Decode(base32Encode(original))).toEqual(original);
  });

  it("generates a 20-byte secret encoded as 32 base32 chars", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(secret)).toHaveLength(20);
  });

  it("accepts the correct code at the current time step and rejects a wrong one", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    const secret = base32Encode(key);
    vi.spyOn(Date, "now").mockReturnValue(0); // counter = 0 -> code "755224" per RFC vector above
    expect(verifyTotpCode(secret, "755224")).toBe(true);
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("tolerates ±1 step of clock drift", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    const secret = base32Encode(key);
    vi.spyOn(Date, "now").mockReturnValue(30_000); // counter = 1 -> code "287082"
    expect(verifyTotpCode(secret, "755224")).toBe(true); // previous step (counter 0) still accepted
  });

  it("rejects malformed codes outright", () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode(secret, "12345")).toBe(false);
    expect(verifyTotpCode(secret, "abcdef")).toBe(false);
    expect(verifyTotpCode(secret, "")).toBe(false);
  });

  it("builds a well-formed otpauth:// URI", () => {
    const uri = totpUri("JBSWY3DPEHPK3PXP", "user@example.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\/MultiPost%20Studio%3Auser%40example\.com\?/);
    expect(uri).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(uri).toContain("digits=6");
    expect(uri).toContain("period=30");
  });
});
