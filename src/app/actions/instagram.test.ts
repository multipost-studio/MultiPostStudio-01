import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { searchInstagramMusic, searchInstagramLocations, InstagramSearchError } from "@/lib/integrations/instagram-search";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { searchInstagramLocationsAction, searchInstagramMusicAction } from "./instagram";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { socialAccount: { findUnique: vi.fn() } } }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: vi.fn(), RateLimitError: class RateLimitError extends Error {} }));
vi.mock("@/lib/social/oauth", () => ({ refreshIfNeeded: vi.fn() }));
vi.mock("@/lib/integrations/instagram-search", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/instagram-search")>()),
  searchInstagramMusic: vi.fn(),
  searchInstagramLocations: vi.fn(),
}));
vi.mock("./_helpers", () => ({
  withPermission: vi.fn().mockResolvedValue({ active: { workspace: { id: "ws1" } } }),
  ensureInWorkspace: vi.fn().mockResolvedValue(undefined),
  ok: (data?: unknown) => ({ ok: true, data }),
  fail: (error: string) => ({ ok: false, error }),
}));

const fbAccount = { id: "a1", platform: "instagram", status: "connected", metadata: JSON.stringify({ remoteId: "1784", pageId: "p" }) };
const igAccount = { ...fbAccount, metadata: JSON.stringify({ remoteId: "1784", igLogin: true }) };

beforeEach(() => {
  vi.mocked(db.socialAccount.findUnique).mockReset().mockResolvedValue(fbAccount as never);
  vi.mocked(enforceRateLimit).mockReset().mockResolvedValue(undefined as never);
  vi.mocked(refreshIfNeeded).mockReset().mockResolvedValue("tok");
  vi.mocked(searchInstagramMusic).mockReset().mockResolvedValue([{ id: "5", title: "T", artist: "A", cover: "", durationMs: 1000, previewUrl: "" }]);
  vi.mocked(searchInstagramLocations).mockReset().mockResolvedValue([{ id: "9", name: "Cafe", place: "Pune" }]);
});

describe("searchInstagramMusicAction", () => {
  it("returns tracks for a Facebook-connected account, using the Instagram user id and token", async () => {
    const r = await searchInstagramMusicAction("a1", "birth");
    expect(r).toMatchObject({ ok: true, data: { tracks: [{ id: "5" }] } });
    expect(searchInstagramMusic).toHaveBeenCalledWith("tok", "1784", "birth");
  });

  it("explains how to reconnect for an Instagram-Login account, and never calls Meta", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(igAccount as never);
    const r = await searchInstagramMusicAction("a1", "x");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/Connect through Facebook/);
    expect(searchInstagramMusic).not.toHaveBeenCalled();
  });

  it("refuses another platform's account and a missing one", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue({ ...fbAccount, platform: "pinterest" } as never);
    expect(await searchInstagramMusicAction("a1", "")).toMatchObject({ ok: false });
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(null as never);
    expect(await searchInstagramMusicAction("a1", "")).toMatchObject({ ok: false });
    expect(await searchInstagramMusicAction("", "")).toMatchObject({ ok: false });
  });

  it("applies the rate limit and an expired login", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(60));
    expect(await searchInstagramMusicAction("a1", "")).toMatchObject({ ok: false, error: expect.stringMatching(/Too many/) });
    vi.mocked(enforceRateLimit).mockResolvedValue(undefined as never);
    vi.mocked(refreshIfNeeded).mockResolvedValue(null);
    expect(await searchInstagramMusicAction("a1", "")).toMatchObject({ ok: false, error: expect.stringMatching(/expired/) });
  });

  it("turns a Meta permission error into a friendly message instead of throwing", async () => {
    vi.mocked(searchInstagramMusic).mockRejectedValue(new InstagramSearchError("permission", "Graph 400: ..."));
    const r = await searchInstagramMusicAction("a1", "");
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toMatch(/Audio API/);
  });
});

describe("searchInstagramLocationsAction", () => {
  it("searches Pages with a location", async () => {
    expect(await searchInstagramLocationsAction("a1", "cafe")).toMatchObject({ ok: true, data: { places: [{ id: "9" }] } });
    expect(searchInstagramLocations).toHaveBeenCalledWith("tok", "cafe");
  });

  it("a one-letter search returns nothing without calling anything", async () => {
    expect(await searchInstagramLocationsAction("a1", "c")).toMatchObject({ ok: true, data: { places: [] } });
    expect(searchInstagramLocations).not.toHaveBeenCalled();
  });

  it("is refused for Instagram-Login accounts", async () => {
    vi.mocked(db.socialAccount.findUnique).mockResolvedValue(igAccount as never);
    expect(await searchInstagramLocationsAction("a1", "cafe")).toMatchObject({ ok: false });
    expect(searchInstagramLocations).not.toHaveBeenCalled();
  });
});
