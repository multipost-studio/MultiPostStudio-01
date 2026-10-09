import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ ctx: null as unknown, rate: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ getWorkspaceContext: vi.fn(async () => m.ctx) }));
vi.mock("@/lib/rate-limit", () => {
  class RateLimitError extends Error {}
  return { enforceRateLimit: (...a: unknown[]) => m.rate(...a), RateLimitError };
});
const svc = vi.hoisted(() => ({ getUnreadCount: vi.fn(), listNotifications: vi.fn() }));
vi.mock("@/lib/notifications/service", () => ({
  ...svc,
  isFilter: (v: unknown) => typeof v === "string" && ["all", "unread", "read", "mentions", "publishing", "system"].includes(v),
}));

import { GET } from "./route";
import { RateLimitError } from "@/lib/rate-limit";

const req = (qs = "") => new NextRequest(`http://localhost/api/notifications${qs}`);
const signedIn = { user: { id: "u1" }, active: { workspace: { id: "w1" } } };

beforeEach(() => {
  vi.clearAllMocks();
  m.ctx = signedIn;
  m.rate.mockResolvedValue(undefined);
  svc.getUnreadCount.mockResolvedValue(4);
  svc.listNotifications.mockResolvedValue({ items: [], nextCursor: null, unread: 4 });
});

describe("GET /api/notifications", () => {
  it("is closed to signed-out visitors", async () => {
    m.ctx = null;
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(svc.listNotifications).not.toHaveBeenCalled();
  });

  it("needs an active workspace too", async () => {
    m.ctx = { user: { id: "u1" }, active: null };
    expect((await GET(req())).status).toBe(401);
  });

  it("returns just the count for the cheap poll", async () => {
    const res = await GET(req("?count=1"));
    expect(await res.json()).toEqual({ unread: 4 });
    expect(svc.getUnreadCount).toHaveBeenCalledWith({ userId: "u1", workspaceId: "w1" });
    expect(svc.listNotifications).not.toHaveBeenCalled();
  });

  it("scopes every list to the session, ignoring any user or workspace passed in the URL", async () => {
    await GET(req("?userId=victim&workspaceId=other&filter=mentions&limit=10&q=launch&cursor=abc"));
    expect(svc.listNotifications).toHaveBeenCalledWith(
      { userId: "u1", workspaceId: "w1" },
      { filter: "mentions", cursor: "abc", limit: 10, q: "launch" },
    );
  });

  it("falls back to 'all' for an unknown filter and never caches", async () => {
    const res = await GET(req("?filter=../../etc"));
    expect(svc.listNotifications.mock.calls[0][1].filter).toBe("all");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("rate limits per user", async () => {
    m.rate.mockRejectedValue(new RateLimitError(Date.now()));
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(m.rate.mock.calls[0][0]).toBe("notifications:u1");
  });

  it("reports a failure without leaking details", async () => {
    svc.listNotifications.mockRejectedValue(new Error("password=hunter2 at db.ts:12"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/hunter2|db\.ts/);
  });
});
