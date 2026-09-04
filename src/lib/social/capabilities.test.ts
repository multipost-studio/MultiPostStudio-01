import { describe, it, expect } from "vitest";
import {
  contentTypesFor,
  contentSpec,
  canPublishType,
  defaultContentType,
  validateChannel,
  splitThread,
  type MediaInput,
} from "./capabilities";

const img = (w = 1080, h = 1080): MediaInput => ({ kind: "image", mimeType: "image/jpeg", width: w, height: h });
const vid = (w = 1080, h = 1920, durationSec = 20): MediaInput => ({
  kind: "video",
  mimeType: "video/mp4",
  width: w,
  height: h,
  durationSec,
});

describe("content types per platform", () => {
  it("exposes the right Instagram types and hides unsupported ones", () => {
    expect(contentTypesFor("instagram").map((c) => c.type)).toEqual(["post", "carousel", "reel", "story"]);
    expect(contentTypesFor("youtube").map((c) => c.type)).toEqual(["video", "short", "community"]);
    expect(contentTypesFor("bluesky").map((c) => c.type)).toEqual(["post"]);
    expect(contentTypesFor("nope")).toEqual([]);
  });

  it("marks community / article / fb-story / tiktok / pinterest as non-publishable", () => {
    expect(canPublishType("youtube", "community")).toBe(false);
    expect(canPublishType("linkedin", "article")).toBe(false);
    expect(canPublishType("facebook", "story")).toBe(false);
    expect(canPublishType("tiktok", "video")).toBe(false);
    expect(canPublishType("pinterest", "pin")).toBe(false);
    expect(canPublishType("instagram", "reel")).toBe(true);
  });

  it("falls back to the platform default for an unknown type", () => {
    expect(contentSpec("instagram", "bogus")?.type).toBe(defaultContentType("instagram"));
  });
});

describe("splitThread", () => {
  it("splits on blank lines and lone --- separators", () => {
    expect(splitThread("one\n\ntwo\n---\nthree")).toEqual(["one", "two", "three"]);
    expect(splitThread("just one line")).toEqual(["just one line"]);
    expect(splitThread("  \n\n  ")).toEqual([]);
  });
});

describe("validateChannel — Instagram", () => {
  it("Feed Post: one square image, within caption limit → clean", () => {
    const r = validateChannel("instagram", "post", { body: "hi", media: [img()] });
    expect(r.errors).toEqual([]);
  });

  it("Feed Post: no media → error", () => {
    const r = validateChannel("instagram", "post", { body: "hi", media: [] });
    expect(r.errors.join(" ")).toMatch(/needs image or video/i);
  });

  it("Carousel: 1 item → too few; 11 → too many; 3 → ok", () => {
    expect(validateChannel("instagram", "carousel", { body: "", media: [img()] }).errors.join(" ")).toMatch(/at least 2/i);
    expect(
      validateChannel("instagram", "carousel", { body: "", media: Array.from({ length: 11 }, () => img()) }).errors.join(" "),
    ).toMatch(/at most 10/i);
    expect(validateChannel("instagram", "carousel", { body: "", media: [img(), img(), img()] }).errors).toEqual([]);
  });

  it("Reel: rejects an image, rejects a 4:3 landscape video, accepts a 9:16 20s video", () => {
    expect(validateChannel("instagram", "reel", { body: "", media: [img()] }).errors.join(" ")).toMatch(/only accepts video/i);
    expect(validateChannel("instagram", "reel", { body: "", media: [vid(1920, 1080, 20)] }).errors.join(" ")).toMatch(/9:16/);
    expect(validateChannel("instagram", "reel", { body: "", media: [vid(1080, 1920, 20)] }).errors).toEqual([]);
  });

  it("Reel: video over 90s → error", () => {
    expect(validateChannel("instagram", "reel", { body: "", media: [vid(1080, 1920, 120)] }).errors.join(" ")).toMatch(/90s or shorter/);
  });

  it("Story: 9:16 media required", () => {
    expect(validateChannel("instagram", "story", { body: "", media: [img(1080, 1080)] }).errors.join(" ")).toMatch(/9:16/);
    expect(validateChannel("instagram", "story", { body: "", media: [img(1080, 1920)] }).errors).toEqual([]);
  });

  it("caption over 2200 chars → error", () => {
    const r = validateChannel("instagram", "post", { body: "x".repeat(2300), media: [img()] });
    expect(r.errors.join(" ")).toMatch(/2,200 characters/);
  });

  it("unknown video dimensions on Reel → warning, not error", () => {
    const r = validateChannel("instagram", "reel", {
      body: "",
      media: [{ kind: "video", mimeType: "video/mp4", durationSec: 20 }],
    });
    expect(r.errors).toEqual([]);
    expect(r.warnings.join(" ")).toMatch(/9:16/);
  });
});

describe("validateChannel — other platforms", () => {
  it("Facebook Feed Post allows zero media", () => {
    expect(validateChannel("facebook", "post", { body: "hello", media: [] }).errors).toEqual([]);
  });

  it("Facebook Story is unsupported → error even with valid media", () => {
    expect(validateChannel("facebook", "story", { body: "", media: [img(1080, 1920)] }).errors.join(" ")).toMatch(/isn't available/i);
  });

  it("YouTube Video requires a video; Short must be vertical", () => {
    expect(validateChannel("youtube", "video", { body: "d", media: [] }).errors.join(" ")).toMatch(/needs video/i);
    expect(validateChannel("youtube", "short", { body: "d", media: [vid(1920, 1080, 60)] }).errors.join(" ")).toMatch(/9:16/);
    expect(validateChannel("youtube", "short", { body: "d", media: [vid(1080, 1920, 60)] }).errors).toEqual([]);
    expect(validateChannel("youtube", "short", { body: "d", media: [vid(1080, 1920, 200)] }).errors.join(" ")).toMatch(/180s or shorter/);
  });

  it("YouTube Community post is unsupported", () => {
    expect(validateChannel("youtube", "community", { body: "hi", media: [] }).errors.join(" ")).toMatch(/no public API/i);
  });

  it("LinkedIn Post allows zero media; Article is unsupported", () => {
    expect(validateChannel("linkedin", "post", { body: "hi", media: [] }).errors).toEqual([]);
    expect(validateChannel("linkedin", "article", { body: "hi", media: [] }).errors.join(" ")).toMatch(/isn't open/i);
  });

  it("X Post: 280 limit; Thread: per-post 280 limit", () => {
    expect(validateChannel("x", "post", { body: "x".repeat(281), media: [] }).errors.join(" ")).toMatch(/280/);
    const thread = validateChannel("x", "thread", { body: `ok\n\n${"y".repeat(300)}`, media: [] });
    expect(thread.errors.join(" ")).toMatch(/Thread post 2 is 300\/280/);
  });

  it("Bluesky: 300 limit, images only, max 4", () => {
    expect(validateChannel("bluesky", "post", { body: "x".repeat(301), media: [] }).errors.join(" ")).toMatch(/300/);
    expect(validateChannel("bluesky", "post", { body: "", media: [vid()] }).errors.join(" ")).toMatch(/only accepts image/i);
    expect(validateChannel("bluesky", "post", { body: "", media: Array.from({ length: 5 }, () => img()) }).errors.join(" ")).toMatch(/at most 4/);
  });

  it("Threads: 500 limit, single media", () => {
    expect(validateChannel("threads", "post", { body: "x".repeat(501), media: [] }).errors.join(" ")).toMatch(/500/);
    expect(validateChannel("threads", "post", { body: "", media: [img(), img()] }).errors.join(" ")).toMatch(/at most 1/);
  });
});
