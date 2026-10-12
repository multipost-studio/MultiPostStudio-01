import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { POST } from "./route";
import { getCurrentUser } from "@/lib/session";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { registerSubscription } from "@/lib/push/store";

let configured = true;
let originOk = true;

vi.mock("@/lib/env", () => ({
  flags: {
    get webPush() {
      return configured;
    },
  },
}));
vi.mock("@/lib/csrf", () => ({ originAllowed: () => originOk }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/push/store", () => ({ registerSubscription: vi.fn() }));

const b64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString("base64url");
const subscription = {
  endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc",
  keys: { p256dh: b64([4, ...Array.from({ length: 64 }, (_, i) => i + 1)]), auth: b64(Array.from({ length: 16 }, (_, i) => i + 1)) },
};
const req = (body: unknown) => ({ headers: new Headers({ "user-agent": "Firefox/127.0" }), json: async () => body }) as unknown as NextRequest;

beforeEach(() => {
  configured = true;
  originOk = true;
  vi.mocked(getCurrentUser).mockReset().mockResolvedValue({ id: "u1", isImpersonated: false } as never);
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(registerSubscription).mockReset().mockResolvedValue({ id: "row" });
});

describe("POST /api/push/subscribe (the service worker re-registering a device)", () => {
  it("registers the new subscription for the signed-in user", async () => {
    const res = await POST(req({ subscription }));
    expect(res.status).toBe(200);
    expect(registerSubscription).toHaveBeenCalledWith("u1", expect.objectContaining({ endpoint: subscription.endpoint }), "Firefox/127.0", undefined);
  });

  it("needs a signed-in session, a same-site origin and a configured server", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await POST(req({ subscription }))).status).toBe(401);
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "u1", isImpersonated: false } as never);
    originOk = false;
    expect((await POST(req({ subscription }))).status).toBe(403);
    originOk = true;
    configured = false;
    expect((await POST(req({ subscription }))).status).toBe(404);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("refuses an administrator viewing as a customer", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "customer", isImpersonated: true } as never);
    expect((await POST(req({ subscription }))).status).toBe(403);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("rejects a subscription whose endpoint is not a real push service", async () => {
    const res = await POST(req({ subscription: { ...subscription, endpoint: "https://internal.example.com/x" } }));
    expect(res.status).toBe(400);
    expect(registerSubscription).not.toHaveBeenCalled();
  });

  it("rejects an unreadable body and applies the rate limit", async () => {
    expect((await POST({ headers: new Headers(), json: async () => { throw new Error("bad json"); } } as unknown as NextRequest)).status).toBe(400);
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(60));
    expect((await POST(req({ subscription }))).status).toBe(429);
  });
});
