import { describe, it, expect } from "vitest";
import {
  computeWebhookStats,
  formatWebhookPayloadPreview,
  getStatusCodeTone,
} from "./webhook-center";

describe("Webhook Center Utilities", () => {
  it("computes accurate success rate and failure metrics", () => {
    const emptyStats = computeWebhookStats([]);
    expect(emptyStats.totalDeliveries).toBe(0);
    expect(emptyStats.successRate).toBe(100);

    const stats = computeWebhookStats([
      { success: true, statusCode: 200 },
      { success: true, statusCode: 204 },
      { success: false, statusCode: 500 },
      { success: false, statusCode: 404 },
    ]);

    expect(stats.totalDeliveries).toBe(4);
    expect(stats.successfulDeliveries).toBe(2);
    expect(stats.failedDeliveries).toBe(2);
    expect(stats.successRate).toBe(50.0);
  });

  it("formats structured JSON payload previews cleanly", () => {
    const payload = JSON.stringify({
      event: "post.published",
      data: { postId: "post_123", channel: "x", impressions: 50 },
    });

    const preview = formatWebhookPayloadPreview(payload);
    expect(preview).toContain("post.published");
    expect(preview).toContain("postId");
  });

  it("handles malformed string payload gracefully", () => {
    const raw = "not-json-payload-at-all";
    const preview = formatWebhookPayloadPreview(raw);
    expect(preview).toBe(raw);
  });

  it("assigns appropriate badge tones based on status codes", () => {
    expect(getStatusCodeTone(200, true)).toBe("success");
    expect(getStatusCodeTone(400, false)).toBe("warning");
    expect(getStatusCodeTone(500, false)).toBe("danger");
    expect(getStatusCodeTone(null, false)).toBe("danger");
  });
});
