import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db", () => ({ db: { apiKey: { findUnique: vi.fn(async () => null) } } }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { ApiAuthError, authenticateApiKey, type ApiKeyContext } from "./auth";
import { trustRequest, trustedContext } from "./pre-auth";

const ctx: ApiKeyContext = { keyId: "k1", orgId: "o1", scopes: ["posts:read"], name: "test" };
const make = (headers: Record<string, string> = {}) => new NextRequest("http://x.test/api/v1/posts", { headers });

describe("requests trusted by the MCP endpoint", () => {
  it("skips the key lookup for a request the server itself marked", async () => {
    const req = make();
    trustRequest(req, ctx);
    await expect(authenticateApiKey(req, "posts:read")).resolves.toEqual(ctx);
  });

  it("still enforces the scope", async () => {
    const req = make();
    trustRequest(req, ctx);
    await expect(authenticateApiKey(req, "posts:write")).rejects.toMatchObject({ status: 403 });
  });

  it("cannot be forged from outside: no header or other request object counts", async () => {
    const forged = make({ "x-trusted": "1", authorization: "Bearer mps_live_notreal" });
    expect(trustedContext(forged)).toBeUndefined();
    await expect(authenticateApiKey(forged, "posts:read")).rejects.toBeInstanceOf(ApiAuthError);

    const marked = make();
    trustRequest(marked, ctx);
    expect(trustedContext(make())).toBeUndefined(); // a different request object is not trusted
  });

  it("an ordinary request without a key is still a 401", async () => {
    await expect(authenticateApiKey(make())).rejects.toMatchObject({ status: 401 });
  });
});
