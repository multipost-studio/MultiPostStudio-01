import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { getTrialReelStatusAction } from "./instagram";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { socialAccount: { findUnique: vi.fn() } } }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/social/oauth", () => ({ refreshIfNeeded: vi.fn() }));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn().mockResolvedValue({ active: { workspace: { id: "ws1" } } }),
  ensureInWorkspace: vi.fn().mockResolvedValue(undefined),
  ok: (data?: unknown) => ({ ok: true, data }),
  fail: (error: string) => ({ ok: false, error }),
}));

const fb = { id: "a1", platform: "instagram", status: "connected", metadata: JSON.stringify({ remoteId: "1784", pageId: "p" }) };
const ig = { ...fb, metadata: JSON.stringify({ remoteId: "1784", igLogin: true }) };
const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.mocked(db.socialAccount.findUnique).mockReset().mockResolvedValue(fb as never);
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(refreshIfNeeded).mockReset().mockResolvedValue("tok");
});
afterEach(() => vi.unstubAllGlobals());

describe("getTrialReelStatusAction", () => {
  it("reports the real follower count and the rule, for either way of connecting", async () => {
    fetchMock.mockResolvedValue(reply({ followers_count: 87 }));
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ ok: true, data: { followers: 87, required: 200, refusal: null } });
    expect(String(fetchMock.mock.calls[0][0])).toContain("https://graph.facebook.com/v21.0/1784?fields=followers_count");
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(ig as never);
    await getTrialReelStatusAction("a1");
    expect(String(fetchMock.mock.calls[1][0])).toContain("https://graph.instagram.com/v21.0/1784?fields=followers_count");
  });

  it("says null, not a guess, when Instagram doesn't answer", async () => {
    fetchMock.mockResolvedValue(reply({}, false));
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ ok: true, data: { followers: null } });
    fetchMock.mockRejectedValue(new Error("network"));
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ ok: true, data: { followers: null } });
    fetchMock.mockResolvedValue(reply({ followers_count: "lots" }));
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ ok: true, data: { followers: null } });
  });

  it("includes a recent refusal Instagram sent", async () => {
    fetchMock.mockResolvedValue(reply({ followers_count: 500 }));
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ ...fb, metadata: JSON.stringify({ remoteId: "1784", trialReelRefused: { at: new Date().toISOString(), reason: "Not eligible" } }) } as never);
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ data: { followers: 500, refusal: { reason: "Not eligible" } } });
  });

  it("refuses another platform's account, and applies the rate limit", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ ...fb, platform: "pinterest" } as never);
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ ok: false });
    expect(await getTrialReelStatusAction("")).toMatchObject({ ok: false });
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(fb as never);
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(60));
    expect(await getTrialReelStatusAction("a1")).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
  });
});
