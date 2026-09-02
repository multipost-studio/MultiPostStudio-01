import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyRazorpayWebhook } from "./razorpay";

// env.RAZORPAY_WEBHOOK_SECRET is unset in tests → verify must fail closed.
describe("verifyRazorpayWebhook", () => {
  it("returns false when no webhook secret is configured", () => {
    const body = JSON.stringify({ event: "subscription.charged" });
    const sig = createHmac("sha256", "whatever").update(body).digest("hex");
    expect(verifyRazorpayWebhook(body, sig)).toBe(false);
  });

  it("returns false for an empty signature", () => {
    expect(verifyRazorpayWebhook("{}", "")).toBe(false);
  });
});
