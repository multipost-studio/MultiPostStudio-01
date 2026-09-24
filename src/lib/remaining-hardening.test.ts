import { describe, it, expect } from "vitest";
import { keyset, pagination } from "./api/respond";
import { originAllowed } from "./csrf";
import { fetchBytesWithLimit } from "./fetch-limited";
import { claimIdempotencyKey } from "./idempotency";
import { getAbuseStats, rateLimit } from "./rate-limit";

describe("keyset pagination", () => {
  it("parses cursor + limit with bounds", () => {
    const k = keyset(new URL("http://x/?cursor=abc123&limit=500"));
    expect(k.cursor).toBe("abc123");
    expect(k.limit).toBe(100);
  });
  it("rejects oversized cursor", () => {
    const k = keyset(new URL(`http://x/?cursor=${"a".repeat(200)}`));
    expect(k.cursor).toBeUndefined();
  });
  it("offset pagination still clamps", () => {
    const p = pagination(new URL("http://x/?page=-5&limit=99999"));
    expect(p.page).toBe(1);
    expect(p.limit).toBe(100);
  });
});

describe("csrf origin check", () => {
  it("passes server-to-server (no origin)", () => {
    expect(originAllowed(new Request("http://x/", { method: "POST" }))).toBe(true);
  });
  it("blocks foreign browser origins", () => {
    expect(
      originAllowed(new Request("http://x/", { method: "POST", headers: { origin: "https://evil.com" } })),
    ).toBe(false);
  });
  it("allows localhost + app hosts", () => {
    expect(
      originAllowed(new Request("http://x/", { method: "POST", headers: { origin: "http://localhost:3000" } })),
    ).toBe(true);
  });
});

describe("fetch-limited", () => {
  it("rejects oversized announced bodies without buffering", async () => {
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("x", { headers: { "content-length": String(10 * 1024 * 1024) } })) as typeof fetch;
    try {
      await expect(fetchBytesWithLimit("http://x/v.mp4", { maxBytes: 100 })).rejects.toThrow(/too large/);
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("idempotency + abuse stats", () => {
  it("claimIdempotencyKey rejects bad keys fail-open", async () => {
    expect(await claimIdempotencyKey("", "t")).toBe(true);
    expect(await claimIdempotencyKey("x".repeat(500), "t")).toBe(true);
  });
  it("abuse stats array exists", async () => {
    await rateLimit(`abuse-test:${Math.random()}`, 1, 60_000);
    expect(Array.isArray(getAbuseStats())).toBe(true);
  });
});
