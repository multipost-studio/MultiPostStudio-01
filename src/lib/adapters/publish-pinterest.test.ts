import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SocialAccount, SocialChannel } from "@prisma/client";
import { publishToPlatform, type PublishProgressHooks } from "@/lib/adapters/publish";
import * as pin from "@/lib/integrations/pinterest";

vi.mock("@/lib/social/oauth", () => ({
  refreshIfNeeded: vi.fn().mockResolvedValue("pin-token"),
  getProvider: vi.fn().mockReturnValue({ clientId: "id", clientSecret: "sec" }),
  isRealToken: vi.fn().mockReturnValue(true),
  isDeadTokenError: vi.fn().mockReturnValue(false),
  markAccountExpired: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/fetch-limited", () => ({
  fetchBytesWithLimit: vi.fn().mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]) }),
}));

// Real payload builders and error text; only the network-facing calls are replaced.
vi.mock("@/lib/integrations/pinterest", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/pinterest")>()),
  listBoards: vi.fn(),
  createPin: vi.fn(),
  registerVideoUpload: vi.fn(),
  uploadVideoBytes: vi.fn(),
  getMediaStatus: vi.fn(),
}));

const account = (metadata: Record<string, unknown> = {}): SocialAccount =>
  ({
    id: "acc_pin",
    workspaceId: "ws",
    platform: "pinterest",
    displayName: "Pins",
    handle: "pins",
    avatarUrl: null,
    status: "connected",
    accessToken: "tok",
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: null,
    metadata: JSON.stringify(metadata),
    connectedAt: new Date(),
    lastSyncedAt: null,
  }) as SocialAccount;

const channel = { id: "ch", workspaceId: "ws", socialAccountId: "acc_pin", platform: "pinterest" } as SocialChannel;

const img = (n: number) => ({ url: `https://cdn.example.com/${n}.jpg`, mimeType: "image/jpeg", kind: "image", altText: `alt ${n}` });
const vid = { url: "https://cdn.example.com/v.mp4", mimeType: "video/mp4", kind: "video", altText: "" };

function memoryHooks(initial: string | null = null) {
  let state = initial;
  const history: string[] = [];
  const hooks: PublishProgressHooks = {
    getRetryState: async () => state,
    setRetryState: async (s) => {
      state = s;
      history.push(s);
    },
  };
  return { hooks, get: () => state, history };
}

beforeEach(() => {
  vi.mocked(pin.listBoards).mockReset().mockResolvedValue([{ id: "111", name: "First", privacy: "PUBLIC", pinCount: 0, description: "" }]);
  vi.mocked(pin.createPin).mockReset().mockResolvedValue({ id: "9001" });
  vi.mocked(pin.registerVideoUpload).mockReset().mockResolvedValue({ mediaId: "m1", uploadUrl: "https://up.example.com/", uploadParameters: {} } as never);
  vi.mocked(pin.uploadVideoBytes).mockReset().mockResolvedValue(undefined);
  vi.mocked(pin.getMediaStatus).mockReset().mockResolvedValue("succeeded");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("publishToPlatform: pinterest", () => {
  it("posts one image Pin to the board chosen for the post", async () => {
    const res = await publishToPlatform(account({ boardId: "222" }), channel, "Title line\nBody text", [img(1), img(2)], "pin", undefined, JSON.stringify({ boardId: "333", link: "https://shop.example.com/p" }));
    expect(res).toEqual({ remoteId: "9001", url: "https://www.pinterest.com/pin/9001/" });
    const payload = vi.mocked(pin.createPin).mock.calls[0][1] as Record<string, unknown>;
    expect(payload.board_id).toBe("333");
    expect(payload.link).toBe("https://shop.example.com/p");
    expect(JSON.stringify(payload.media_source)).toContain("1.jpg");
    expect(JSON.stringify(payload.media_source)).not.toContain("2.jpg");
    expect(pin.listBoards).not.toHaveBeenCalled();
  });

  it("falls back to the account default board, then to the first board", async () => {
    await publishToPlatform(account({ boardId: "222" }), channel, "hi", [img(1)], "pin");
    expect((vi.mocked(pin.createPin).mock.calls[0][1] as Record<string, unknown>).board_id).toBe("222");

    await publishToPlatform(account(), channel, "hi", [img(1)], "pin");
    expect(pin.listBoards).toHaveBeenCalledOnce();
    expect((vi.mocked(pin.createPin).mock.calls[1][1] as Record<string, unknown>).board_id).toBe("111");
  });

  it("ignores a malformed saved board id instead of sending it", async () => {
    await publishToPlatform(account({ boardId: "../evil" }), channel, "hi", [img(1)], "pin");
    expect((vi.mocked(pin.createPin).mock.calls[0][1] as Record<string, unknown>).board_id).toBe("111");
  });

  it("fails clearly when the account has no board", async () => {
    vi.mocked(pin.listBoards).mockResolvedValue([]);
    await expect(publishToPlatform(account(), channel, "hi", [img(1)], "pin")).rejects.toThrow(/No Pinterest board/);
    expect(pin.createPin).not.toHaveBeenCalled();
  });

  it("sends a carousel of up to five images", async () => {
    await publishToPlatform(account({ boardId: "222" }), channel, "hi", [1, 2, 3, 4, 5, 6, 7].map(img), "carousel_pin");
    const source = (vi.mocked(pin.createPin).mock.calls[0][1] as { media_source: { source_type: string; items?: unknown[] } }).media_source;
    expect(source.source_type).toBe("multiple_image_urls");
    expect(source.items).toHaveLength(5);
  });

  it("requires an image for an image Pin", async () => {
    await expect(publishToPlatform(account({ boardId: "222" }), channel, "hi", [], "pin")).rejects.toThrow(/image attachment/);
  });

  it("uploads a video, waits for processing, then creates the Pin", async () => {
    const { hooks, history } = memoryHooks();
    const res = await publishToPlatform(account({ boardId: "222" }), channel, "Clip", [vid, img(1)], "video_pin", hooks);
    expect(res.remoteId).toBe("9001");
    expect(pin.registerVideoUpload).toHaveBeenCalledOnce();
    expect(pin.uploadVideoBytes).toHaveBeenCalledOnce();
    const source = (vi.mocked(pin.createPin).mock.calls[0][1] as { media_source: Record<string, unknown> }).media_source;
    expect(source.source_type).toBe("video_id");
    expect(source.media_id).toBe("m1");
    expect(source.cover_image_url).toBe("https://cdn.example.com/1.jpg");
    expect(history.some((h) => h.includes("pinterest-media") && h.includes("m1"))).toBe(true);
  });

  it("reports a failed video as a non-retryable message", async () => {
    vi.mocked(pin.getMediaStatus).mockResolvedValue("failed");
    const err = await publishToPlatform(account({ boardId: "222" }), channel, "Clip", [vid], "video_pin").catch((e: Error) => e);
    expect((err as Error).message).toMatch(/couldn't process the video/);
    expect((err as Error).message).not.toMatch(/retrying automatically/);
    expect(pin.createPin).not.toHaveBeenCalled();
  });

  it("keeps the uploaded media id when processing is slow, so the retry does not upload again", async () => {
    vi.useFakeTimers();
    const { hooks } = memoryHooks();
    vi.mocked(pin.getMediaStatus).mockResolvedValue("processing");
    const first = publishToPlatform(account({ boardId: "222" }), channel, "Clip", [vid], "video_pin", hooks).catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(40_000);
    expect(((await first) as Error).message).toMatch(/still processing.*retrying automatically/);
    expect(pin.uploadVideoBytes).toHaveBeenCalledOnce();

    vi.mocked(pin.getMediaStatus).mockResolvedValue("succeeded");
    const res = await publishToPlatform(account({ boardId: "222" }), channel, "Clip", [vid], "video_pin", hooks);
    expect(res.remoteId).toBe("9001");
    expect(pin.registerVideoUpload).toHaveBeenCalledOnce();
    expect(pin.uploadVideoBytes).toHaveBeenCalledOnce();
  });

  it("a video Pin without a video attachment fails before any upload", async () => {
    await expect(publishToPlatform(account({ boardId: "222" }), channel, "Clip", [img(1)], "video_pin")).rejects.toThrow(/video attachment/);
    expect(pin.registerVideoUpload).not.toHaveBeenCalled();
  });
});
