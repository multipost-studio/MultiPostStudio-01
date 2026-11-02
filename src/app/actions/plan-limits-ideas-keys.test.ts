import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { createIdeaAction } from "./ideas";
import { createApiKeyAction } from "./integrations";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/events", () => ({ logActivity: vi.fn(), logAudit: vi.fn() }));
vi.mock("@/lib/adapters/billing", () => ({ bumpUsage: vi.fn(), debumpUsage: vi.fn() }));
vi.mock("@/lib/adapters/webhooks", () => ({ sendTestEvent: vi.fn(), isSafeWebhookUrl: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/social/bluesky", () => ({ blueskyLogin: vi.fn(), blueskyGetProfile: vi.fn() }));
vi.mock("@/lib/social/crypto", () => ({ encryptToken: vi.fn(), readToken: vi.fn() }));
vi.mock("@/lib/social/oauth", () => ({ revokeAtProvider: vi.fn() }));
vi.mock("@/lib/social/providers", () => ({ getProvider: vi.fn() }));
vi.mock("@/lib/social/channel-history", () => ({ keepPublishedHistory: vi.fn() }));
vi.mock("@/lib/env", () => ({ isProduction: false }));

const guard = vi.hoisted(() => ({ limitGuard: vi.fn() }));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn(async () => ({ active: { org: { id: "org1" }, workspace: { id: "ws1" } }, user: { id: "u1" } })),
  entitlementGuard: vi.fn(async () => null),
  limitGuard: guard.limitGuard,
  ensureInWorkspace: vi.fn(),
  scopedCampaignRefs: vi.fn(async () => ({ campaignId: null, pillarId: null })),
  ok: (data?: unknown, message?: string) => ({ ok: true, data, message }),
  fail: (error: string) => ({ ok: false, error }),
}));
vi.mock("@/lib/db", () => ({
  db: {
    contentIdea: { count: vi.fn(), create: vi.fn() },
    apiKey: { count: vi.fn(), create: vi.fn() },
  },
}));

beforeEach(() => {
  guard.limitGuard.mockReset().mockResolvedValue(null);
  vi.mocked(db.contentIdea.count).mockReset().mockResolvedValue(40 as never);
  vi.mocked(db.contentIdea.create).mockReset().mockResolvedValue({ id: "i1" } as never);
  vi.mocked(db.apiKey.count).mockReset().mockResolvedValue(2 as never);
  vi.mocked(db.apiKey.create).mockReset().mockResolvedValue({} as never);
});

const form = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.set(k, v);
  return f;
};

describe("ideas limit", () => {
  it("counts the ideas on the board across the whole organisation and asks the plan", async () => {
    await createIdeaAction(null, form({ title: "A new idea" }));
    expect(db.contentIdea.count).toHaveBeenCalledWith({ where: { workspace: { orgId: "org1" }, stage: "idea" } });
    expect(guard.limitGuard).toHaveBeenCalledWith("org1", "maxIdeas", 40, "ideas");
    expect(db.contentIdea.create).toHaveBeenCalled();
  });

  it("stops at the plan's limit without creating the idea", async () => {
    guard.limitGuard.mockResolvedValue({ ok: false, error: "Your plan allows 100 ideas. You're at 100." });
    expect(await createIdeaAction(null, form({ title: "One too many" }))).toMatchObject({ ok: false, error: expect.stringContaining("100 ideas") });
    expect(db.contentIdea.create).not.toHaveBeenCalled();
  });
});

describe("API keys limit", () => {
  it("counts only active keys (revoked ones do not count) and asks the plan", async () => {
    await createApiKeyAction(null, form({ name: "CI" }));
    expect(db.apiKey.count).toHaveBeenCalledWith({ where: { orgId: "org1", revokedAt: null } });
    expect(guard.limitGuard).toHaveBeenCalledWith("org1", "maxApiKeys", 2, "API keys");
    expect(db.apiKey.create).toHaveBeenCalled();
  });

  it("stops at the plan's limit without creating a key", async () => {
    guard.limitGuard.mockResolvedValue({ ok: false, error: "Your plan allows 1 API keys. You're at 1." });
    expect(await createApiKeyAction(null, form({ name: "CI" }))).toMatchObject({ ok: false });
    expect(db.apiKey.create).not.toHaveBeenCalled();
  });
});
