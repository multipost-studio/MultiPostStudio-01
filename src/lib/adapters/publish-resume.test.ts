import { describe, expect, it, vi, beforeEach } from "vitest";
import { publishToPlatform, type PublishProgressHooks } from "@/lib/adapters/publish";
import type { SocialAccount, SocialChannel } from "@prisma/client";

// Mock fetch and crypto / refresh
vi.mock("@/lib/social/oauth", () => ({
  refreshIfNeeded: vi.fn().mockResolvedValue("mock-access-token"),
  getProvider: vi.fn().mockReturnValue({ clientId: "id", clientSecret: "sec" }),
  isRealToken: vi.fn().mockReturnValue(true),
  isDeadTokenError: vi.fn().mockReturnValue(false),
  markAccountExpired: vi.fn().mockResolvedValue(undefined),
}));

describe("publishToPlatform idempotency & crash recovery", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockAccount: SocialAccount = {
    id: "acc_123",
    workspaceId: "ws_123",
    platform: "facebook",
    displayName: "Test Page",
    handle: "testpage",
    avatarUrl: null,
    status: "connected",
    accessToken: "valid-fb-token",
    refreshToken: null,
    tokenExpiresAt: null,
    scopes: null,
    metadata: JSON.stringify({ remoteId: "page_456" }),
    connectedAt: new Date(),
    lastSyncedAt: null,
  };

  const mockChannel: SocialChannel = {
    id: "chan_123",
    workspaceId: "ws_123",
    socialAccountId: "acc_123",
    platform: "facebook",
    name: "Main Page",
    handle: "testpage",
    avatarUrl: null,
    timezone: "UTC",
    followerCount: 0,
    queuePaused: false,
    createdAt: new Date(),
  };

  it("returns completed post immediately if provider succeeded before server crash", async () => {
    let savedState: string | null = JSON.stringify({
      kind: "completed",
      remoteId: "fb_post_999",
      url: "https://www.facebook.com/page_456/posts/fb_post_999",
      fingerprint: JSON.stringify(["acc_123", "facebook", "Hello world!", "post"]),
    });

    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await publishToPlatform(
      mockAccount,
      mockChannel,
      "Hello world!",
      [],
      "post",
      hooks,
    );

    expect(result.remoteId).toBe("fb_post_999");
    expect(result.url).toBe("https://www.facebook.com/page_456/posts/fb_post_999");
    // Verify provider API was NOT called again — zero network requests made
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not reuse completed post if content fingerprint changed", async () => {
    let savedState: string | null = JSON.stringify({
      kind: "completed",
      remoteId: "fb_post_old",
      url: "https://www.facebook.com/page_456/posts/fb_post_old",
      fingerprint: JSON.stringify(["acc_123", "facebook", "Old content", "post"]),
    });

    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    // Mock fetch for the new post
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ id: "fb_post_new" }), { status: 200 }),
    );

    const result = await publishToPlatform(
      mockAccount,
      mockChannel,
      "New edited content!",
      [],
      "post",
      hooks,
    );

    expect(result.remoteId).toBe("fb_post_new");
    expect(hooks.setRetryState).toHaveBeenCalled();
    const finalSaved = JSON.parse(savedState!);
    expect(finalSaved.kind).toBe("completed");
    expect(finalSaved.remoteId).toBe("fb_post_new");
  });

  it("resumes Instagram container creation without duplicating container on retry", async () => {
    const igAccount: SocialAccount = {
      ...mockAccount,
      platform: "instagram",
      metadata: JSON.stringify({ remoteId: "ig_biz_1" }),
    };

    // Simulate crash after container created
    let savedState: string | null = JSON.stringify({
      kind: "ig-container",
      creationId: "container_abc_123",
      fingerprint: JSON.stringify(["Check this photo", "https://example.com/pic.jpg", "post"]),
    });

    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    // fetch should ONLY be called for igPublish (media_publish) and NOT for creating container
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "ig_post_live" }), { status: 200 }),
    );

    const result = await publishToPlatform(
      igAccount,
      mockChannel,
      "Check this photo",
      [{ url: "https://example.com/pic.jpg", mimeType: "image/jpeg", kind: "image", altText: "" }],
      "post",
      hooks,
    );

    expect(result.remoteId).toBe("ig_post_live");
    // Verify only media_publish was called with container_abc_123
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callOpts] = fetchSpy.mock.calls[0];
    expect(String(callUrl)).toContain("media_publish");
    expect(String(callOpts?.body)).toContain("container_abc_123");
  });

  it("resumes Threads container creation without duplicating container on retry", async () => {
    const thAccount: SocialAccount = {
      ...mockAccount,
      platform: "threads",
      metadata: JSON.stringify({ remoteId: "threads_user_1" }),
    };

    let savedState: string | null = JSON.stringify({
      kind: "threads-container",
      containerId: "th_container_555",
      fingerprint: JSON.stringify(["Threads text update", ""]),
    });

    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "th_post_published" }), { status: 200 }),
    );

    const result = await publishToPlatform(
      thAccount,
      mockChannel,
      "Threads text update",
      [],
      "post",
      hooks,
    );

    expect(result.remoteId).toBe("th_post_published");
    // Verify only threads_publish was called with creation_id th_container_555
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callOpts] = fetchSpy.mock.calls[0];
    expect(String(callUrl)).toContain("threads_publish");
    expect(String(callOpts?.body)).toContain("th_container_555");
  });

  it("resumes Facebook multi-photo post by reusing uploaded photo IDs", async () => {
    let savedState: string | null = JSON.stringify({
      kind: "fb-photos",
      photoIds: ["photo_1", "photo_2"],
      mediaUrls: ["https://example.com/p1.jpg", "https://example.com/p2.jpg"],
    });

    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ id: "fb_feed_post_multi" }), { status: 200 }),
    );

    const result = await publishToPlatform(
      mockAccount,
      mockChannel,
      "Multi photo post",
      [
        { url: "https://example.com/p1.jpg", mimeType: "image/jpeg", kind: "image", altText: "" },
        { url: "https://example.com/p2.jpg", mimeType: "image/jpeg", kind: "image", altText: "" },
      ],
      "post",
      hooks,
    );

    expect(result.remoteId).toBe("fb_feed_post_multi");
    // Should ONLY call /feed attaching existing photo_1 and photo_2, NOT /photos
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [callUrl, callOpts] = fetchSpy.mock.calls[0];
    expect(String(callUrl)).toContain("/feed");
    expect(String(callOpts?.body)).toContain("photo_1");
    expect(String(callOpts?.body)).toContain("photo_2");
  });

  it("resumes TikTok publishing when upload succeeded and status is complete", async () => {
    const tkAccount: SocialAccount = {
      ...mockAccount,
      platform: "tiktok",
    };

    let savedState: string | null = JSON.stringify({
      kind: "tiktok-upload",
      publishId: "v_pub_789",
      videoUrl: "https://example.com/video.mp4",
    });

    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    // Return status COMPLETE
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: { status: "COMPLETE", public_post_id: ["tk_post_111"] },
        }),
        { status: 200 },
      ),
    );

    const result = await publishToPlatform(
      tkAccount,
      mockChannel,
      "TikTok dance video",
      [{ url: "https://example.com/video.mp4", mimeType: "video/mp4", kind: "video", altText: "" }],
      "post",
      hooks,
    );

    expect(result.remoteId).toBe("tk_post_111");
    expect(result.url).toContain("tk_post_111");
  });

  it("does not mark completed if provider throws 500 error", async () => {
    let savedState: string | null = null;
    const hooks: PublishProgressHooks = {
      getRetryState: vi.fn(async () => savedState),
      setRetryState: vi.fn(async (s) => {
        savedState = s;
      }),
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Internal Server Error", { status: 500 }),
    );

    await expect(
      publishToPlatform(mockAccount, mockChannel, "Fail please", [], "post", hooks),
    ).rejects.toThrow();

    expect(savedState).toBeNull();
  });
});

