import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ user: null as unknown, perms: new Set<string>(), rate: vi.fn(), search: vi.fn() }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(async () => m.user), getStaffPermissions: vi.fn(async () => m.perms) }));
vi.mock("@/lib/admin-search", async (orig) => ({ ...(await orig<typeof import("@/lib/admin-search")>()), searchAdmin: (...a: unknown[]) => m.search(...a) }));
vi.mock("@/lib/rate-limit", () => {
  class RateLimitError extends Error {}
  return { enforceRateLimit: (...a: unknown[]) => m.rate(...a), RateLimitError };
});

import { GET } from "./route";
import { RateLimitError } from "@/lib/rate-limit";

const req = (q = "acme") => new NextRequest(`http://localhost/api/admin/search?q=${q}`);

beforeEach(() => {
  vi.clearAllMocks();
  m.user = { id: "a1", isPlatformAdmin: true, platformRole: null };
  m.perms = new Set(["users.view", "orgs.view", "support.view", "billing.view"]);
  m.rate.mockResolvedValue(undefined);
  m.search.mockResolvedValue([{ type: "user", id: "u", title: "t", subtitle: "s", href: "/admin/users/u" }]);
});

describe("GET /api/admin/search", () => {
  it("is closed to signed-out visitors and ordinary customers", async () => {
    m.user = null;
    expect((await GET(req())).status).toBe(403);
    m.user = { id: "c1", isPlatformAdmin: false, platformRole: null };
    expect((await GET(req())).status).toBe(403);
    expect(m.search).not.toHaveBeenCalled();
  });

  it("searches everything a staff member may view", async () => {
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).results).toHaveLength(1);
    expect(m.search).toHaveBeenCalledWith("acme", { users: true, orgs: true, tickets: true, invoices: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("limits the search to the permissions the staff member holds", async () => {
    m.user = { id: "s1", isPlatformAdmin: true, platformRole: "support" };
    m.perms = new Set(["support.view"]);
    await GET(req());
    expect(m.search).toHaveBeenCalledWith("acme", { users: false, orgs: false, tickets: true, invoices: false });
  });

  it("rate limits per administrator", async () => {
    m.rate.mockRejectedValue(new RateLimitError(Date.now()));
    expect((await GET(req())).status).toBe(429);
    expect(m.rate.mock.calls[0][0]).toBe("admin-search:a1");
  });

  it("hides the reason a search failed", async () => {
    m.search.mockRejectedValue(new Error("password=hunter2 at db.ts"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toMatch(/hunter2|db\.ts/);
  });
});
