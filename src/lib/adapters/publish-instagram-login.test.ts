import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { publishToPlatform } from "@/lib/adapters/publish";
import type { SocialAccount } from "@prisma/client";

vi.mock("@/lib/social/oauth", () => ({
  refreshIfNeeded: vi.fn().mockResolvedValue("tok"),
  isDeadTokenError: vi.fn().mockReturnValue(false),
  markAccountExpired: vi.fn().mockResolvedValue(undefined),
}));

const account = (metadata: Record<string, unknown>): SocialAccount =>
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
    metadata: JSON.stringify(metadata),
    connectedAt: new Date(),
    lastSyncedAt: null,
  }) as SocialAccount;

const image = { url: "https://cdn.example.com/a.jpg", mimeType: "image/jpeg", kind: "image", altText: "" };
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (url: string) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ id: String(url).includes("media_publish") ? "post1" : "container1" }),
  }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));

describe("publishing to Instagram", () => {
  it("an Instagram-Login account creates and publishes its container on graph.instagram.com", async () => {
    const r = await publishToPlatform(account({ remoteId: "1784", igLogin: true }), null, "hi", [image], "post");
    expect(r.remoteId).toBe("post1");
    expect(urls()).toEqual([
      "https://graph.instagram.com/v21.0/1784/media",
      "https://graph.instagram.com/v21.0/1784/media_publish",
    ]);
  });

  it("a Facebook-connected account keeps using graph.facebook.com", async () => {
    await publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [image], "post");
    expect(urls()).toEqual([
      "https://graph.facebook.com/v21.0/1784/media",
      "https://graph.facebook.com/v21.0/1784/media_publish",
    ]);
  });

  it("carousel children, the parent and the publish all go to the account's host", async () => {
    await publishToPlatform(account({ remoteId: "1784", igLogin: true }), null, "hi", [image, image], "carousel");
    expect(urls().length).toBe(4);
    expect(urls().every((u) => u.startsWith("https://graph.instagram.com/v21.0/1784/"))).toBe(true);
  });
});
