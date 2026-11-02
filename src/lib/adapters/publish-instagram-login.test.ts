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

// the container status checks (GET .../?fields=status_code) are not part of what these tests are about
const urls = () => fetchMock.mock.calls.map((c) => String(c[0])).filter((u) => !u.includes("fields=status_code"));
const bodyOf = (i: number) => Object.fromEntries((fetchMock.mock.calls.filter((c) => !String(c[0]).includes("fields=status_code"))[i][1].body as URLSearchParams).entries());
const video = { url: "https://cdn.example.com/a.mp4", mimeType: "video/mp4", kind: "video", altText: "" };

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

describe("Instagram composer options", () => {
  it("a Reel on a Facebook-connected account sends collaborators, trial, share to feed, AI label, music and location", async () => {
    const options = JSON.stringify({ igCollaborators: "ann, ben", igTrial: "manual", igShareToFeed: "0", igAi: "1", igMusicId: "55", igMusicVolume: "80", igVideoVolume: "40", igLocationId: "77" });
    await publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [video], "reel", undefined, options);
    // Music is documented on API v22, so only that request moves to it.
    expect(urls()[0]).toBe("https://graph.facebook.com/v22.0/1784/media");
    expect(urls()[1]).toBe("https://graph.facebook.com/v21.0/1784/media_publish");
    expect(bodyOf(0)).toMatchObject({
      media_type: "REELS",
      collaborators: '["ann","ben"]',
      trial_params: '{"graduation_strategy":"MANUAL"}',
      share_to_feed: "false",
      is_ai_generated: "true",
      audio_configuration: '{"audio_id":"55","audio_volume":80,"video_volume":40}',
      location_id: "77",
    });
  });

  it("without music a Reel stays on the same API version as before", async () => {
    await publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [video], "reel", undefined, JSON.stringify({ igTrial: "auto" }));
    expect(urls()[0]).toBe("https://graph.facebook.com/v21.0/1784/media");
    expect(bodyOf(0).trial_params).toBe('{"graduation_strategy":"SS_PERFORMANCE"}');
  });

  it("an Instagram-Login account drops music and location but keeps what it supports, and still publishes", async () => {
    const options = JSON.stringify({ igCollaborators: "ann", igMusicId: "55", igLocationId: "77", igTrial: "manual" });
    const r = await publishToPlatform(account({ remoteId: "1784", igLogin: true }), null, "hi", [video], "reel", undefined, options);
    expect(r.remoteId).toBe("post1");
    const sent = bodyOf(0);
    expect(sent.collaborators).toBe('["ann"]');
    expect(sent.trial_params).toBeDefined();
    expect(sent.audio_configuration).toBeUndefined();
    expect(sent.location_id).toBeUndefined();
    expect(urls()[0].startsWith("https://graph.instagram.com/v21.0/")).toBe(true);
  });

  it("a carousel puts collaborators and the AI label on the carousel, never on its items", async () => {
    await publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [image, image], "carousel", undefined, JSON.stringify({ igCollaborators: "ann", igAi: "1" }));
    expect(bodyOf(0).collaborators).toBeUndefined();
    expect(bodyOf(1).collaborators).toBeUndefined();
    expect(bodyOf(2)).toMatchObject({ media_type: "CAROUSEL", collaborators: '["ann"]', is_ai_generated: "true" });
  });

  it("junk saved options never stop a post", async () => {
    for (const junk of ["not json", "[]", JSON.stringify({ igMusicId: "x;y", igCollaborators: "!!!", igTrial: "weird" })]) {
      fetchMock.mockClear();
      const r = await publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [image], "post", undefined, junk);
      expect(r.remoteId).toBe("post1");
    }
  });

  it("a rejected music track explains what to do", async () => {
    fetchMock.mockImplementation(async () => ({ ok: false, status: 400, text: async () => "media issue" }));
    await expect(
      publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [video], "reel", undefined, JSON.stringify({ igMusicId: "55" })),
    ).rejects.toThrow(/Remove it or choose another/);
  });
});

describe("Instagram video processing", () => {
  const status = (code: string, detail?: string) =>
    fetchMock.mockImplementation(async (url: string) => {
      const u = String(url);
      if (u.includes("fields=status_code")) return { ok: true, status: 200, json: async () => ({ status_code: code, status: detail }), text: async () => "" };
      return { ok: true, status: 200, text: async () => JSON.stringify({ id: u.includes("media_publish") ? "post1" : "container1" }) };
    });
  const reel = () => publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [video], "reel");
  const published = () => fetchMock.mock.calls.some((c) => String(c[0]).includes("media_publish"));

  it("publishes once Instagram says the video is FINISHED", async () => {
    status("FINISHED");
    expect((await reel()).remoteId).toBe("post1");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("fields=status_code,status"))).toBe(true);
  });

  it("stops with Instagram's own reason when it cannot process the video, without trying to publish", async () => {
    status("ERROR", "Error: Video file is too long.");
    await expect(reel()).rejects.toThrow(/could not process the video \(ERROR\): Error: Video file is too long\./);
    expect(published()).toBe(false);
  });

  it("an expired upload is forgotten so the retry uploads again", async () => {
    status("EXPIRED");
    let saved: string | null = null;
    const hooks = { getRetryState: async () => null, setRetryState: async (s: string) => void (saved = s) };
    await expect(publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [video], "reel", hooks)).rejects.toThrow(/EXPIRED/);
    expect(JSON.parse(saved ?? "{}").kind).toBe("ig-reset");
  });

  it("gives up waiting after a while with an error that is retried automatically, and keeps the upload for the retry", async () => {
    vi.useFakeTimers();
    try {
      status("IN_PROGRESS");
      const settled = reel().then(() => null, (e: Error) => e);
      await vi.advanceTimersByTimeAsync(60_000);
      const e = (await settled) as Error;
      expect(e.message).toMatch(/still processing the video/);
      const { isRetryablePublishError } = await import("@/lib/adapters/publish");
      expect(isRetryablePublishError(e.message)).toBe(true);
      expect(published()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("images are published straight away, with no status check", async () => {
    status("IN_PROGRESS");
    await publishToPlatform(account({ remoteId: "1784", pageId: "p" }), null, "hi", [image], "post");
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("fields=status_code"))).toBe(false);
  });
});
