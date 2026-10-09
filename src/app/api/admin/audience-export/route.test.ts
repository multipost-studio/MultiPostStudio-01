import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "./route";
import { getCurrentUser } from "@/lib/session";
import { resolveAudience } from "@/lib/marketing-analytics";
import { logAudit } from "@/lib/events";

const perms = vi.hoisted(() => ({ held: new Set<string>() }));
vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), hasAdminPermission: vi.fn(async (k: string) => perms.held.has(k)) }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  RateLimitError: class RateLimitError extends Error {},
}));
vi.mock("@/lib/marketing-analytics", () => ({ resolveAudience: vi.fn() }));

const req = (f?: unknown) => new NextRequest(`http://localhost/api/admin/audience-export${f ? `?f=${encodeURIComponent(JSON.stringify(f))}` : ""}`);
const admin = { id: "a1", isPlatformAdmin: true, platformRole: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue(admin as never);
  perms.held = new Set(["data.export", "marketing.view"]);
  vi.mocked(resolveAudience).mockResolvedValue({
    total: 2,
    truncated: false,
    byPlan: [],
    members: [
      { id: "1", name: "=cmd|' /C calc'!A0", email: "a@x.com", createdAt: new Date("2026-10-01T00:00:00Z"), plan: "free", channel: "Email", source: "newsletter", campaign: null },
      { id: "2", name: 'Quote "Q", Inc', email: "b@x.com", createdAt: new Date("2026-10-02T00:00:00Z"), plan: "pro", channel: null, source: null, campaign: null },
    ],
  } as never);
});

describe("GET /api/admin/audience-export", () => {
  it("refuses signed-out users, customers, and staff missing either permission", async () => {
    const cases: [unknown, string[]][] = [
      [null, ["data.export", "marketing.view"]],
      [{ id: "u", isPlatformAdmin: false, platformRole: null }, []],
      [{ id: "s", isPlatformAdmin: true, platformRole: "support" }, ["support.view", "support.manage"]],
      [{ id: "f", isPlatformAdmin: true, platformRole: "scoped" }, ["data.export"]], // can export, cannot see marketing data
      [{ id: "m", isPlatformAdmin: true, platformRole: "scoped" }, ["marketing.view"]], // can see it, cannot export
    ];
    for (const [u, held] of cases) {
      vi.mocked(getCurrentUser).mockResolvedValue(u as never);
      perms.held = new Set(held);
      const res = await GET(req({ sources: ["x"] }));
      expect(res.status).toBe(403);
    }
    expect(resolveAudience).not.toHaveBeenCalled();
  });

  it("returns an attachment CSV, neutralises formulas and quotes cells, and audits the export", async () => {
    const res = await GET(req({ channels: ["Email"] }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="audience-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const text = await res.text();
    expect(text.split("\r\n")[0]).toBe("name,email,plan,channel,source,campaign,signed_up");
    expect(text).toContain("'=cmd"); // formula prefixed so spreadsheets don't execute it
    expect(text).toContain('"Quote ""Q"", Inc"');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "a1", action: "marketing.audience_export", metadata: expect.objectContaining({ rows: 2 }) }));
  });

  it("treats a garbage filter as 'everyone' rather than failing", async () => {
    const res = await GET(new NextRequest("http://localhost/api/admin/audience-export?f=%7Bnot-json"));
    expect(res.status).toBe(200);
  });
});
