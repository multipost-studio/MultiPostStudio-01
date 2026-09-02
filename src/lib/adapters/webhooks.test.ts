import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "./webhooks";

const secret = "whsec_test_deadbeef";
const ts = "1700000000";
const body = JSON.stringify({ event: "post.published", data: { postId: "p_123" } });

describe("signPayload", () => {
  it("produces a stable sha256= prefixed hex digest", () => {
    const sig = signPayload(secret, ts, body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(signPayload(secret, ts, body)).toBe(sig);
  });

  it("changes when any input changes", () => {
    const base = signPayload(secret, ts, body);
    expect(signPayload("other", ts, body)).not.toBe(base);
    expect(signPayload(secret, "1700000001", body)).not.toBe(base);
    expect(signPayload(secret, ts, body + " ")).not.toBe(base);
  });
});

describe("verifySignature", () => {
  it("accepts a signature it just produced", () => {
    const sig = signPayload(secret, ts, body);
    expect(verifySignature(secret, ts, body, sig)).toBe(true);
  });

  it("rejects a tampered body, wrong secret, or empty signature", () => {
    const sig = signPayload(secret, ts, body);
    expect(verifySignature(secret, ts, body + "x", sig)).toBe(false);
    expect(verifySignature("wrong", ts, body, sig)).toBe(false);
    expect(verifySignature(secret, ts, body, "")).toBe(false);
    expect(verifySignature(secret, ts, body, "sha256=00")).toBe(false);
  });
});
