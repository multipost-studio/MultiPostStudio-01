import { describe, expect, it } from "vitest";
import { BLOG_LAUNCH_POSTS } from "@/content/blog-launch/posts.generated";
import { checkLaunchPost } from "./blog-launch";
import { extractFaq, parseMarkdown } from "./markdown";

describe("launch batch content", () => {
  it("has 60 posts with unique slugs and orders 1..60", () => {
    expect(BLOG_LAUNCH_POSTS).toHaveLength(60);
    expect(new Set(BLOG_LAUNCH_POSTS.map((p) => p.slug)).size).toBe(60);
    expect(BLOG_LAUNCH_POSTS.map((p) => p.order).sort((a, b) => a - b)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
  });

  it("every post passes the SEO / AEO / GEO structure checks", () => {
    const failures = BLOG_LAUNCH_POSTS.flatMap((p) => checkLaunchPost(p).map((problem) => `${p.order} ${p.slug}: ${problem}`));
    expect(failures).toEqual([]);
  });

  it("every post parses into headings and a 3–6 question FAQ for structured data", () => {
    for (const p of BLOG_LAUNCH_POSTS) {
      const blocks = parseMarkdown(p.content);
      expect(blocks.filter((b) => b.t === "h" && b.level === 2).length, p.slug).toBeGreaterThanOrEqual(5);
      const faq = extractFaq(blocks).length;
      expect(faq, p.slug).toBeGreaterThanOrEqual(3);
      expect(faq, p.slug).toBeLessThanOrEqual(6);
    }
  });

  it("uses distinct focus keywords and titles", () => {
    expect(new Set(BLOG_LAUNCH_POSTS.map((p) => p.focusKeyword.toLowerCase())).size).toBe(60);
    expect(new Set(BLOG_LAUNCH_POSTS.map((p) => p.title.toLowerCase())).size).toBe(60);
  });

  it("contains no invented-statistic tells or banned claims", () => {
    const text = (p: (typeof BLOG_LAUNCH_POSTS)[number]) => p.content.toLowerCase();
    for (const p of BLOG_LAUNCH_POSTS) {
      expect(text(p), p.slug).not.toMatch(/according to a (recent )?(study|survey|report)|studies show|research shows that \d|\d{2,3}% of (marketers|users|consumers|brands)/);
      expect(text(p), p.slug).not.toMatch(/referral program|mobile app|auto-?dm/);
      expect(p.content, p.slug).not.toContain("—"); // em dash
    }
  });

  it("links only to known internal pages", () => {
    const allowed = new Set(["/features", "/pricing", "/platforms", "/tools/hashtag-generator", "/tools/character-counter"]);
    for (const p of BLOG_LAUNCH_POSTS) {
      const links = [...p.content.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]);
      expect(links.length, p.slug).toBeGreaterThanOrEqual(1);
      for (const l of links) expect(allowed.has(l), `${p.slug} -> ${l}`).toBe(true);
    }
  });
});
