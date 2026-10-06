import { describe, expect, it } from "vitest";
import { isRetryablePublishError } from "@/lib/adapters/publish";
import { buildRuleSet, DEFAULT_RULES } from "@/lib/platform-rules";
import { checkChannels, PREFLIGHT_PREFIX, problemLines } from "./post-checks";

const img = { kind: "image", mimeType: "image/jpeg", width: 1080, height: 1080 };
const tags = (n: number) => Array.from({ length: n }, (_, i) => `#t${i}`).join(" ");
const ch = (platform: string, body: string, extra: Partial<Parameters<typeof checkChannels>[0]["channels"][number]> = {}) => ({
  channelId: `c-${platform}`,
  name: platform,
  platform,
  contentType: platform === "tiktok" ? "video" : "post",
  body,
  ...extra,
});

describe("checkChannels — multi-platform", () => {
  it("one post, four channels: each is judged by its own platform's rules", () => {
    const body = `Launch day ${tags(7)}`;
    const check = checkChannels({
      media: [],
      channels: [ch("instagram", body), ch("bluesky", body), ch("linkedin", body), ch("facebook", body)],
    });
    const by = Object.fromEntries(check.channels.map((c) => [c.platform, c]));
    expect(by.instagram.valid).toBe(false); // 7 > 5 hashtags
    expect(by.instagram.errors[0]).toContain("up to 5 hashtags");
    expect(by.bluesky.valid).toBe(true);
    expect(by.linkedin.valid).toBe(true); // recommendation only
    expect(by.linkedin.state).toBe("warning");
    expect(by.facebook.state).toBe("ok");
    expect(check.valid).toBe(false);
    expect(check.validCount).toBe(3);
    expect(check.invalidCount).toBe(1);
  });

  it("customised text per channel validates independently", () => {
    const check = checkChannels({
      media: [img],
      channels: [ch("instagram", `Short ${tags(5)}`), ch("x", "a".repeat(300), { tier: "standard" })],
    });
    expect(check.channels.find((c) => c.platform === "instagram")?.valid).toBe(true);
    expect(check.channels.find((c) => c.platform === "x")?.errors[0]).toContain("This X account supports 280");
  });

  it("an X Premium account gets the long limit; an unverified one is told so", () => {
    const long = "a".repeat(1000);
    expect(checkChannels({ media: [], channels: [ch("x", long, { tier: "premium" })] }).valid).toBe(true);
    const unknown = checkChannels({ media: [], channels: [ch("x", long)] }).channels[0];
    expect(unknown.valid).toBe(false);
    expect(unknown.notes.join(" ")).toContain("could not be verified");
  });

  it("first-comment hashtags count toward Instagram's limit but not on platforms without one", () => {
    const withComment = checkChannels({ media: [img], firstComment: "#a #b #c #d", channels: [ch("instagram", tags(3))] });
    expect(withComment.valid).toBe(false);
    const bluesky = checkChannels({ media: [], firstComment: tags(40), channels: [ch("bluesky", "hi")] });
    expect(bluesky.valid).toBe(true);
  });

  it("uses admin-changed rules", () => {
    const rules = buildRuleSet(DEFAULT_RULES, [{ id: "instagram.hashtags.max", value: 8 }]);
    expect(checkChannels({ rules, media: [img], channels: [ch("instagram", tags(7))] }).valid).toBe(true);
  });

  it("formats problems as 'Channel: message' lines", () => {
    const check = checkChannels({ media: [img], channels: [ch("instagram", tags(6))] });
    expect(problemLines(check)[0]).toMatch(/^instagram: Instagram allows up to 5 hashtags/);
  });

  it("warnings and notes never invalidate a channel", () => {
    const c = checkChannels({ media: [], channels: [ch("linkedin", tags(20))] }).channels[0];
    expect(c.errors).toEqual([]);
    expect(c.warnings.length).toBe(1);
    expect(c.valid).toBe(true);
  });
});

describe("pre-flight errors are permanent", () => {
  it("never retried, even when the message contains 5xx-looking numbers", () => {
    expect(isRetryablePublishError(`${PREFLIGHT_PREFIX}Threads allows 500 characters. Your post contains 501.`)).toBe(false);
    expect(isRetryablePublishError("Threads 503 service unavailable")).toBe(true);
  });
});
