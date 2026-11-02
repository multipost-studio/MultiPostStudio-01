import { describe, expect, it } from "vitest";
import { friendlyPublishError } from "./publish-errors";
import { PREFLIGHT_PREFIX } from "./post-checks";

describe("friendlyPublishError", () => {
  it("never leaks raw API JSON or status lines", () => {
    const raws = [
      'Graph /1789/media 400: {"error":{"message":"Invalid parameter","type":"OAuthException","code":100,"fbtrace_id":"A1b2"}}',
      'X 403: {"title":"Forbidden","detail":"You are not permitted to perform this action."}',
      "Pinterest pin 422: {\"code\":2,\"message\":\"Invalid image\"}",
      "ECONNRESET socket hang up",
      "something weird happened {stack at x.js:1}",
    ];
    for (const r of raws) {
      const f = friendlyPublishError("instagram", r);
      expect(f, r).not.toMatch(/[{}]|fbtrace|OAuthException|\bat x\.js/);
      expect(f.length).toBeLessThan(200);
    }
  });

  it("explains the common causes in plain, platform-specific words", () => {
    expect(friendlyPublishError("instagram", "(#190) Error validating access token: Session has expired")).toBe(
      "Your Instagram connection has expired or was revoked. Reconnect the account in Integrations, then retry.",
    );
    expect(friendlyPublishError("instagram", "Invalid hashtag count in caption")).toContain("rejected the hashtags");
    expect(friendlyPublishError("bluesky", "Record/text must not be longer than 300 graphemes")).toBe("Bluesky says this post's text is too long. Shorten it and retry.");
    expect(friendlyPublishError("x", "X rate limited (429) — the cap is exhausted")).toContain("limiting how fast");
    expect(friendlyPublishError("linkedin", "LinkedIn 403 forbidden")).toContain("refused permission");
    expect(friendlyPublishError("tiktok", "TikTok init 400: unsupported video codec")).toContain("couldn't accept the attached media");
    expect(friendlyPublishError("youtube", "YouTube upload 503 service unavailable")).toContain("temporary problem");
    expect(friendlyPublishError("x", "duplicate content")).toContain("duplicate");
  });

  it("passes our own pre-flight messages through untouched", () => {
    const m = `${PREFLIGHT_PREFIX}Instagram allows up to 5 hashtags. You currently have 7.`;
    expect(friendlyPublishError("instagram", m)).toBe(m);
  });

  it("falls back to a safe generic sentence", () => {
    expect(friendlyPublishError("pinterest", "boom")).toBe("Publishing to Pinterest failed. Open the post and retry; if it keeps failing, contact support.");
  });
});

describe("friendlyPublishError for Instagram (Meta) errors", () => {
  const graph = (body: object, path = "1784/media", status = 400) => `Graph ${path} ${status}: ${JSON.stringify(body)}`;
  const err = (e: object) => ({ error: { type: "OAuthException", is_transient: false, ...e } });

  it("no longer calls every Instagram 400 a media problem just because the request path says /media", () => {
    const out = friendlyPublishError("instagram", graph(err({ message: "Invalid parameter", code: 100 })));
    expect(out).not.toContain("attached media");
  });

  it("passes Instagram's own plain explanation on", () => {
    const out = friendlyPublishError("instagram", graph(err({ message: "Invalid parameter", code: 100, error_user_title: "Bad caption", error_user_msg: "The caption is not allowed." })));
    expect(out).toBe("Instagram says: The caption is not allowed.");
  });

  it("explains a rejected music track and says what to do", () => {
    const out = friendlyPublishError("instagram", graph(err({ message: "audio_configuration is invalid", code: 100, error_user_msg: "This audio is not available for your account." })));
    expect(out).toContain("couldn't use the music track");
    expect(out).toContain("Remove it or choose another");
  });

  it("explains a trial reel, a collaborator and a location that Instagram refused", () => {
    expect(friendlyPublishError("instagram", graph(err({ message: "x", code: 100, error_user_msg: "Trial reels are not available for this account." })))).toContain("Trial reel to Off");
    expect(friendlyPublishError("instagram", graph(err({ message: "Invalid collaborator", code: 100, error_user_msg: "Collaborators must be public." })))).toContain("collaborator");
    expect(friendlyPublishError("instagram", graph(err({ message: "Invalid location id", code: 100 })))).toContain("couldn't use that location");
  });

  it("a video that is not ready yet is temporary, not a media error", () => {
    const raw = graph(err({ message: "Media ID is not available", code: 9007, error_subcode: 2207027, error_user_msg: "The media is not ready for publishing, please wait for a moment" }), "1784/media_publish");
    expect(friendlyPublishError("instagram", raw)).toContain("still processing the video");
  });

  it("reports a video Instagram could not process with Instagram's reason", () => {
    const out = friendlyPublishError("instagram", "Instagram could not process the video (ERROR): Error: Video file is too long.");
    expect(out).toContain("couldn't process the video");
    expect(out).toContain("Instagram says: Video file is too long");
  });

  it("an expired upload says it will be uploaded again", () => {
    expect(friendlyPublishError("instagram", "Instagram upload expired (EXPIRED); a new upload starts on the next try (temporary).")).toContain("upload expired");
  });

  it("a permission error is reported as one, not as media", () => {
    expect(friendlyPublishError("instagram", graph(err({ message: "(#10) Application does not have permission for this action", code: 10 })))).toContain("refused permission");
  });

  it("other platforms are unaffected", () => {
    expect(friendlyPublishError("tiktok", "TikTok init 400: unsupported video codec")).toContain("couldn't accept the attached media");
  });
});
