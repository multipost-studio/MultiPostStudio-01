import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { publishToPlatform } from "@/lib/adapters/publish";
import type { SocialAccount } from "@prisma/client";

vi.mock("@/lib/social/oauth", () => ({
  refreshIfNeeded: vi.fn().mockResolvedValue("tok"),
  isDeadTokenError: vi.fn().mockReturnValue(false),
  markAccountExpired: vi.fn().mockResolvedValue(undefined),
}));

const account = (): SocialAccount =>
  ({
    id: "acc1",
    workspaceId: "ws1",
    platform: "instagram",
    displayName: "Shop",
    handle: "@shop",
    avatarUrl: null,
    status: "connected",
    accessToken: "x",
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: null,
    metadata: JSON.stringify({ remoteId: "1784", pageId: "p" }),
    connectedAt: new Date(),
    lastSyncedAt: null,
  }) as SocialAccount;

const video = { url: "https://cdn.example.com/a.mp4", mimeType: "video/mp4", kind: "video", altText: "" };
const fetchMock = vi.fn();
const ok = (u: string) => ({ ok: true, status: 200, json: async () => ({}), text: async () => JSON.stringify({ id: u.includes("media_publish") ? "post1" : "container1" }) });
const refused = () => ({ ok: false, status: 400, text: async () => '{"error":{"message":"Invalid parameter","code":100}}' });

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (u: string) => ok(String(u)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const withMusic = (video_volume: string) => JSON.stringify({ igMusicId: "55", igMusicVolume: "80", igVideoVolume: video_volume });
const containerCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).endsWith("/1784/media"));
const audioOf = (i: number) => JSON.parse((containerCalls()[i][1].body as URLSearchParams).get("audio_configuration") as string);

describe("original sound set to 0", () => {
  it("asks Instagram for 0 first, and keeps it when Instagram accepts it", async () => {
    await publishToPlatform(account(), null, "hi", [video], "reel", undefined, withMusic("0"));
    expect(containerCalls().length).toBe(1);
    expect(audioOf(0)).toEqual({ audio_id: "55", audio_volume: 80, video_volume: 0 });
  });

  it("if Instagram refuses 0 it asks again with 1, the lowest value Meta documents, and still publishes", async () => {
    fetchMock.mockImplementation(async (url: string, init?: { body?: URLSearchParams }) => {
      const u = String(url);
      const cfg = init?.body?.get?.("audio_configuration") ?? "";
      if (u.endsWith("/1784/media") && cfg.includes('"video_volume":0')) return refused();
      return ok(u);
    });
    const r = await publishToPlatform(account(), null, "hi", [video], "reel", undefined, withMusic("0"));
    expect(r.remoteId).toBe("post1");
    expect(containerCalls().length).toBe(2);
    expect(audioOf(0).video_volume).toBe(0);
    expect(audioOf(1)).toEqual({ audio_id: "55", audio_volume: 80, video_volume: 1 });
  });

  it("a nonzero volume is never retried", async () => {
    fetchMock.mockImplementation(async () => refused());
    await expect(publishToPlatform(account(), null, "hi", [video], "reel", undefined, withMusic("40"))).rejects.toThrow();
    expect(containerCalls().length).toBe(1);
  });

  it("if Instagram refuses the retry too, the post fails with that error instead of looping", async () => {
    fetchMock.mockImplementation(async () => refused());
    await expect(publishToPlatform(account(), null, "hi", [video], "reel", undefined, withMusic("0"))).rejects.toThrow();
    expect(containerCalls().length).toBe(2);
  });
});
