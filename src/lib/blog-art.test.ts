import { describe, expect, it } from "vitest";
import { coverShapes, coverTheme, detectPlatform, seedFor } from "./blog-art";
import { BLOG_LAUNCH_POSTS } from "@/content/blog-launch/posts.generated";

describe("blog art helpers", () => {
  it("gives every launch category its own theme", () => {
    const cats = [...new Set(BLOG_LAUNCH_POSTS.map((p) => p.category))];
    expect(cats).toHaveLength(6);
    expect(new Set(cats.map((c) => coverTheme(c).from)).size).toBe(6);
    expect(coverTheme("Unknown")).toEqual(coverTheme(null));
  });

  it("detects the platform a post is about", () => {
    expect(detectPlatform("instagram-hashtag-limit-2026")).toBe("instagram");
    expect(detectPlatform("X (Twitter) Character Limit: 280 vs 25,000 Explained")).toBe("x");
    expect(detectPlatform("bluesky-character-limit-graphemes")).toBe("bluesky");
    expect(detectPlatform("Google Business Profile Posts")).toBe("gbp");
    expect(detectPlatform("threads-topic-tags-guide")).toBe("threads");
    expect(detectPlatform("social-media-content-calendar")).toBeNull();
    // "x" inside other words must not match
    expect(detectPlatform("complex mix of excellent texts")).toBeNull();
  });

  it("is stable per slug but different across slugs", () => {
    expect(seedFor("a-post")).toBe(seedFor("a-post"));
    expect(seedFor("a-post")).not.toBe(seedFor("b-post"));
    expect(coverShapes(seedFor("a-post"))).toEqual(coverShapes(seedFor("a-post")));
    expect(coverShapes(seedFor("a-post"))).not.toEqual(coverShapes(seedFor("b-post")));
  });

  it("every launch post maps to a theme and valid shapes", () => {
    for (const p of BLOG_LAUNCH_POSTS) {
      expect(coverTheme(p.category).from).toMatch(/^#/);
      for (const s of coverShapes(seedFor(p.slug))) {
        expect(s.x).toBeGreaterThanOrEqual(0);
        expect(s.x).toBeLessThanOrEqual(100);
        expect(s.o).toBeGreaterThan(0);
      }
    }
  });
});
