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
