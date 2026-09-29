import { describe, it, expect } from "vitest";
import { sluggify, analyzeBlogSeo } from "./blog";

describe("Blog Utilities & SEO Engine", () => {
  describe("sluggify", () => {
    it("converts spaces and symbols to clean lowercase slugs", () => {
      expect(sluggify("10 Content Strategies for 2026!")).toBe("10-content-strategies-for-2026");
      expect(sluggify("  What's New in MultiPost Studio?  ")).toBe("whats-new-in-multipost-studio");
      expect(sluggify("Special @#$% Characters")).toBe("special-characters");
    });

    it("collapses multiple consecutive hyphens", () => {
      expect(sluggify("Hello --- World")).toBe("hello-world");
    });
  });

  describe("analyzeBlogSeo", () => {
    it("evaluates a well-optimized post with high score", () => {
      const longContent = `## Introduction to Content Strategy
Content strategy is essential for modern social media teams. Check out our [features](/features) to learn more.

## Core Pillars
Building a systematic pipeline allows teams to produce quality updates.
Here is a comprehensive breakdown of planning, distribution, and performance analysis.
We recommend reviewing internal playbooks and external benchmarks.
Regular cadence produces compounding returns over sporadic virality.
Reference: [External Study](https://example.com/study)
`.repeat(10);

      const result = analyzeBlogSeo({
        title: "Mastering Content Strategy in 2026: The Complete Guide",
        slug: "mastering-content-strategy-2026",
        seoDescription:
          "Discover how to master content strategy in 2026 with our complete guide covering planning, workflow, and measurable social impact.",
        content: longContent,
        focusKeyword: "content strategy",
        featuredImage: "/uploads/strategy-hero.png",
        featuredImageAlt: "Mastering content strategy illustration",
      });

      expect(result.score).toBeGreaterThanOrEqual(80);
      expect(result.checks.find((i) => i.id === "title_good")?.status).toBe("pass");
      expect(result.checks.find((i) => i.id === "desc_good")?.status).toBe("pass");
      expect(result.checks.find((i) => i.id === "keyword_in_title")?.status).toBe("pass");
      expect(result.checks.find((i) => i.id === "keyword_in_slug")?.status).toBe("pass");
      expect(result.checks.find((i) => i.id === "headings")?.status).toBe("pass");
      expect(result.checks.find((i) => i.id === "links")?.status).toBe("pass");
      expect(result.wordCount).toBeGreaterThan(400);
      expect(result.estimatedReadMins).toBeGreaterThan(1);
    });

    it("flags missing title and short content with warnings/failures", () => {
      const result = analyzeBlogSeo({
        title: "Short",
        slug: "short",
        content: "Very brief text.",
      });

      expect(result.score).toBeLessThan(60);
      expect(result.checks.find((i) => i.id === "title_short")?.status).toBe("warn");
      expect(result.checks.find((i) => i.id === "desc_missing")?.status).toBe("fail");
      expect(result.checks.find((i) => i.id === "content_very_short")?.status).toBe("fail");
    });
  });
});
