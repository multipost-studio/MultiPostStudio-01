import { describe, expect, it } from "vitest";
import { isRetryablePublishError } from "@/lib/adapters/publish";

describe("isRetryablePublishError", () => {
  it("treats rate limits as retryable", () => {
    expect(isRetryablePublishError("X rate limited (429) — cap exhausted")).toBe(true);
    expect(isRetryablePublishError("Rate limit exceeded, retry later")).toBe(true);
    expect(isRetryablePublishError("429 Too Many Requests")).toBe(true);
  });

  it("treats server and network errors as retryable", () => {
    expect(isRetryablePublishError("Graph /me/feed 500: internal error")).toBe(true);
    expect(isRetryablePublishError("YouTube 503: backend error")).toBe(true);
    expect(isRetryablePublishError("fetch failed: socket hang up")).toBe(true);
    expect(isRetryablePublishError("Connect timeout")).toBe(true);
  });

  it("treats auth and validation errors as permanent", () => {
    expect(isRetryablePublishError("X token unavailable — reconnect")).toBe(false);
    expect(isRetryablePublishError("X 401: unauthorized")).toBe(false);
    expect(isRetryablePublishError("X 403: tier lacks write access")).toBe(false);
    expect(isRetryablePublishError("Graph media 404: not found")).toBe(false);
    expect(isRetryablePublishError("Thread is empty")).toBe(false);
    expect(isRetryablePublishError("Media publishing isn't implemented for X yet")).toBe(false);
  });
});
