import { describe, it, expect, vi } from "vitest";

/**
 * A production deployment with no TOKEN_ENC_KEY used to fail invisibly:
 * `key()` threw, `readToken`'s bare `catch` swallowed the throw and returned
 * null, and null means "not connected" to every caller — so every social
 * account in the deployment looked disconnected, publishing quietly stopped,
 * and no log said why.
 *
 * Env is mocked for the whole module, so this misconfiguration lives in its
 * own file rather than in crypto.test.ts.
 */
vi.mock("@/lib/env", () => ({
  env: { TOKEN_ENC_KEY: undefined, LOG_LEVEL: "silent" },
  isProduction: true,
  requireAuthSecret: () => "a-secret-long-enough-to-pass",
}));

const { readToken, encryptToken, isRealToken } = await import("./crypto");

describe("production with no TOKEN_ENC_KEY", () => {
  it("refuses to encrypt rather than writing a token under a guessable key", () => {
    expect(() => encryptToken("real-token")).toThrow(/TOKEN_ENC_KEY/);
  });

  it("surfaces the misconfiguration instead of reporting 'not connected'", () => {
    // The blob's content is irrelevant — the key is missing before we get to it.
    expect(() => readToken("c29tZS1jaXBoZXJ0ZXh0LWJsb2I=")).toThrow(/TOKEN_ENC_KEY/);
    expect(() => isRealToken("c29tZS1jaXBoZXJ0ZXh0LWJsb2I=")).toThrow(/TOKEN_ENC_KEY/);
  });

  it("still answers the cases that never need the key", () => {
    // Empty and stub_ tokens are decided before any decryption, so a missing
    // key must not turn "no account" into a crash on, say, the accounts page.
    expect(readToken(null)).toBeNull();
    expect(readToken("")).toBeNull();
    expect(readToken("stub_abc123")).toBe("stub_abc123");
    expect(isRealToken("stub_abc123")).toBe(false);
  });
});
