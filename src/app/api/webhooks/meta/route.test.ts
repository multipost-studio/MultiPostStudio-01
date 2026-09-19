import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";

// The route under test reads the token from the environment (no hardcoded
// default) — stub it per test so expectations don't depend on real config.
const TEST_TOKEN = "test-meta-verify-token-12345";

beforeEach(() => {
  vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", TEST_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/webhooks/meta", () => {
  it("echos back challenge when verify token matches", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.challenge=1158201244&hub.verify_token=${TEST_TOKEN}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toBe("1158201244");
  });

  it("returns 403 when verify token does not match", async () => {
    const req = new NextRequest(
      "http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.challenge=1158201244&hub.verify_token=wrong_token",
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it("returns 403 when no token is configured", async () => {
    vi.stubEnv("META_WEBHOOK_VERIFY_TOKEN", "");
    const req = new NextRequest(
      `http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.challenge=1158201244&hub.verify_token=${TEST_TOKEN}`,
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
});
