import { describe, expect, it } from "vitest";
import { REASON_MAX, REASON_MIN, parseReason } from "./admin-reason";

describe("parseReason", () => {
  it("accepts a real sentence and tidies whitespace", () => {
    expect(parseReason("  Customer  paid by bank\ntransfer ")).toEqual({ ok: true, reason: "Customer paid by bank transfer" });
  });
  it("rejects missing, short and non-text reasons", () => {
    for (const v of [undefined, null, 42, {}, "", "   ", "short", "x".repeat(REASON_MIN - 1)]) expect(parseReason(v).ok).toBe(false);
  });
  it("treats padding as nothing: eight spaces plus one letter is not a reason", () => {
    expect(parseReason("        a").ok).toBe(false);
  });
  it("accepts exactly the minimum and the maximum, and rejects one more", () => {
    expect(parseReason("x".repeat(REASON_MIN)).ok).toBe(true);
    expect(parseReason("x".repeat(REASON_MAX)).ok).toBe(true);
    expect(parseReason("x".repeat(REASON_MAX + 1)).ok).toBe(false);
  });
});
