import { describe, it, expect } from "vitest";
import { signPayload, verifySignature, isSafeWebhookUrl } from "./webhooks";

describe("webhook signature", () => {
  it("verifies a signature computed with the same secret + inputs", () => {
    const sig = signPayload("whsec_test", "1234567890", '{"event":"post.published"}');
    expect(verifySignature("whsec_test", "1234567890", '{"event":"post.published"}', sig)).toBe(true);
  });

  it("rejects a wrong secret, tampered body, or garbage signature", () => {
    const sig = signPayload("whsec_test", "1234567890", '{"a":1}');
    expect(verifySignature("whsec_wrong", "1234567890", '{"a":1}', sig)).toBe(false);
    expect(verifySignature("whsec_test", "1234567890", '{"a":2}', sig)).toBe(false);
    expect(verifySignature("whsec_test", "1234567890", '{"a":1}', "not-a-real-signature")).toBe(false);
  });
});

// Regression test for the outbound-webhook SSRF hardening from the security
// audit: admin-configured webhook URLs are trusted to be real external
// endpoints, but nothing stopped one from literally being localhost / a
// private range / the cloud metadata IP. isSafeWebhookUrl() blocks those
// outright; deliverOnce() (exercised via dispatchWebhook/sendTestEvent)
// refuses to fetch a url that fails this check.
describe("isSafeWebhookUrl (SSRF guard)", () => {
  it("allows ordinary public https/http urls", () => {
    expect(isSafeWebhookUrl("https://example.com/hooks/multipost")).toBe(true);
    expect(isSafeWebhookUrl("https://hooks.zapier.com/hooks/catch/123/abc")).toBe(true);
    expect(isSafeWebhookUrl("http://example.com/hook")).toBe(true);
  });

  it("blocks localhost, private ranges, and the cloud metadata address", () => {
    expect(isSafeWebhookUrl("http://localhost:3000/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://127.0.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://10.1.2.3/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://172.16.0.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://172.31.255.255/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://192.168.1.1/hook")).toBe(false);
    expect(isSafeWebhookUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isSafeWebhookUrl("http://[::1]/hook")).toBe(false);
  });

  it("blocks non-http(s) schemes and malformed urls", () => {
    expect(isSafeWebhookUrl("file:///etc/passwd")).toBe(false);
    expect(isSafeWebhookUrl("not a url")).toBe(false);
    expect(isSafeWebhookUrl("")).toBe(false);
  });

  it("does not false-positive on public IPs/hosts that merely start similarly", () => {
    expect(isSafeWebhookUrl("https://172.32.0.1/hook")).toBe(true); // just outside 172.16-31/12
    expect(isSafeWebhookUrl("https://11.0.0.1/hook")).toBe(true); // just outside 10.0.0.0/8
  });
});
