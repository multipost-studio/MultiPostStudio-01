import { describe, expect, it } from "vitest";
import { canDecide, isFullRefund, parseRefundAmount, refundableMinor, refundedOrReservedMinor } from "./refund-rules";

const r = (status: string, amountMinor: number) => ({ status, amountMinor });

describe("refundable amount", () => {
  it("counts refunded, processing and pending requests, and ignores rejected, failed and canceled ones", () => {
    const reqs = [r("refunded", 1000), r("pending", 500), r("processing", 200), r("rejected", 9999), r("failed", 9999), r("canceled", 9999)];
    expect(refundedOrReservedMinor(reqs)).toBe(1700);
    expect(refundableMinor(5000, reqs)).toBe(3300);
  });
  it("never goes below zero", () => {
    expect(refundableMinor(1000, [r("refunded", 1500)])).toBe(0);
  });
  it("a fresh invoice is fully refundable", () => {
    expect(refundableMinor(4900, [])).toBe(4900);
  });
});

describe("parseRefundAmount", () => {
  it("turns major units into minor units", () => {
    expect(parseRefundAmount("12.50", 5000)).toEqual({ ok: true, minor: 1250 });
    expect(parseRefundAmount(49, 5000)).toEqual({ ok: true, minor: 4900 });
    expect(parseRefundAmount("500", 100000, 0)).toEqual({ ok: true, minor: 500 });
    expect(parseRefundAmount("1.005", 5000, 3)).toEqual({ ok: true, minor: 1005 });
  });
  it("accepts exactly the refundable amount and rejects one unit more", () => {
    expect(parseRefundAmount("50.00", 5000).ok).toBe(true);
    expect(parseRefundAmount("50.01", 5000).ok).toBe(false);
  });
  it("rejects zero, negatives, junk and absurd input", () => {
    for (const bad of ["", " ", "0", "-5", "abc", "NaN", "Infinity", null, undefined, {}, 0, -1, "0.001"]) expect(parseRefundAmount(bad as never, 5000).ok, String(bad)).toBe(false);
  });
});

describe("canDecide", () => {
  it("a different person may decide", () => {
    expect(canDecide("a", "b", false)).toEqual({ ok: true });
  });
  it("the requester may not approve their own request unless self-approval is allowed", () => {
    expect(canDecide("a", "a", false).ok).toBe(false);
    expect(canDecide("a", "a", true).ok).toBe(true);
  });
  it("a request whose requester account is gone can be decided by anyone", () => {
    expect(canDecide(null, "a", false).ok).toBe(true);
  });
});

describe("isFullRefund", () => {
  it("is true only once refunded requests add up to the invoice", () => {
    expect(isFullRefund(5000, [r("refunded", 2000), r("refunded", 3000)])).toBe(true);
    expect(isFullRefund(5000, [r("refunded", 2000), r("pending", 3000)])).toBe(false);
    expect(isFullRefund(0, [])).toBe(false);
  });
});
