import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { GET, DEFAULT_META_VERIFY_TOKEN } from "./route";

describe("GET /api/webhooks/meta", () => {
  it("echos back challenge when verify token matches", async () => {
    const req = new NextRequest(
      `http://localhost:3000/api/webhooks/meta?hub.mode=subscribe&hub.challenge=1158201244&hub.verify_token=${DEFAULT_META_VERIFY_TOKEN}`,
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
});
