import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { GET } from "./route";
import { requireWorkspace } from "@/lib/session";
import { getAnalytics } from "@/lib/analytics";
import { hasEntitlement } from "@/lib/entitlements";
import { enforceRateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/session", () => ({ requireWorkspace: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ getAnalytics: vi.fn() }));
vi.mock("@/lib/entitlements", () => ({ hasEntitlement: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const ctx = (permissions: string[]) => ({ user: { id: "u1", timezone: "UTC" }, active: { org: { id: "org1" }, workspace: { id: "ws1" }, permissions } });
const req = () => ({ url: "https://app.example.com/api/analytics/export?dataset=series" }) as unknown as NextRequest;

beforeEach(() => {
  vi.mocked(requireWorkspace).mockReset();
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(hasEntitlement).mockReset().mockResolvedValue(true);
  vi.mocked(getAnalytics).mockReset().mockResolvedValue({ days: 30, series: [{ label: "d1", followers: 1, reach: 2, impressions: 3, engagement: 4 }] } as never);
});

describe("GET /api/analytics/export", () => {
  it("refuses a member whose role has no analytics.view (a custom role), before any work is done", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(["content.create"]) as never);
    const res = await GET(req());
    expect(res.status).toBe(403);
    expect(getAnalytics).not.toHaveBeenCalled();
    expect(enforceRateLimit).not.toHaveBeenCalled();
  });

  it("exports for a member who can view analytics", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(["analytics.view"]) as never);
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(await res.text()).toContain("followers");
  });

  it("still enforces the plan entitlement after the permission check", async () => {
    vi.mocked(requireWorkspace).mockResolvedValue(ctx(["analytics.view"]) as never);
    vi.mocked(hasEntitlement).mockResolvedValue(false);
    expect((await GET(req())).status).toBe(403);
  });
});
