import { describe, it, expect } from "vitest";
import {
  validateHexColor,
  validateLogoUrl,
  groupPostsByDate,
  calculatePortalSummaryStats,
  type PortalCalendarPost,
} from "./portal-branding";

describe("Portal Branding Utilities", () => {
  describe("validateHexColor", () => {
    it("accepts null, undefined, and empty string as valid no-ops", () => {
      expect(validateHexColor(null)).toBe(true);
      expect(validateHexColor(undefined)).toBe(true);
      expect(validateHexColor("")).toBe(true);
      expect(validateHexColor("   ")).toBe(true);
    });

    it("accepts valid 3-digit and 6-digit hex colors", () => {
      expect(validateHexColor("#fff")).toBe(true);
      expect(validateHexColor("#000000")).toBe(true);
      expect(validateHexColor("#4F46E5")).toBe(true);
      expect(validateHexColor("#f09")).toBe(true);
    });

    it("rejects invalid hex strings", () => {
      expect(validateHexColor("blue")).toBe(false);
      expect(validateHexColor("#12345")).toBe(false);
      expect(validateHexColor("#1234567")).toBe(false);
      expect(validateHexColor("123456")).toBe(false);
      expect(validateHexColor("rgb(0,0,0)")).toBe(false);
    });
  });

  describe("validateLogoUrl", () => {
    it("accepts null, undefined, and empty string", () => {
      expect(validateLogoUrl(null)).toBe(true);
      expect(validateLogoUrl(undefined)).toBe(true);
      expect(validateLogoUrl("")).toBe(true);
    });

    it("accepts standard HTTP/HTTPS URLs", () => {
      expect(validateLogoUrl("https://example.com/logo.png")).toBe(true);
      expect(validateLogoUrl("http://cdn.test.org/assets/brand.svg")).toBe(true);
    });

    it("accepts relative paths and data URIs", () => {
      expect(validateLogoUrl("/assets/logo.png")).toBe(true);
      expect(validateLogoUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(true);
    });

    it("rejects javascript: or malformed URLs", () => {
      expect(validateLogoUrl("javascript:alert(1)")).toBe(false);
      expect(validateLogoUrl("ftp://test.org/logo.png")).toBe(false);
    });
  });

  describe("groupPostsByDate", () => {
    it("groups posts by date correctly and sorts chronologically", () => {
      const posts: PortalCalendarPost[] = [
        {
          id: "p1",
          title: "Post 1",
          status: "scheduled",
          scheduledAt: "2026-10-01T14:00:00.000Z",
          publishedAt: null,
          channels: [{ platform: "instagram", body: "Hello" }],
          mediaUrls: [],
        },
        {
          id: "p2",
          title: "Post 2",
          status: "scheduled",
          scheduledAt: "2026-10-01T18:00:00.000Z",
          publishedAt: null,
          channels: [{ platform: "x", body: "World" }],
          mediaUrls: [],
        },
        {
          id: "p3",
          title: "Post 3",
          status: "scheduled",
          scheduledAt: "2026-10-02T10:00:00.000Z",
          publishedAt: null,
          channels: [{ platform: "linkedin", body: "Career" }],
          mediaUrls: [],
        },
      ];

      const refDate = new Date("2026-10-01T00:00:00.000Z");
      const groups = groupPostsByDate(posts, refDate);

      expect(groups).toHaveLength(2);
      expect(groups[0].dateKey).toBe("2026-10-01");
      expect(groups[0].isToday).toBe(true);
      expect(groups[0].posts).toHaveLength(2);

      expect(groups[1].dateKey).toBe("2026-10-02");
      expect(groups[1].isToday).toBe(false);
      expect(groups[1].posts).toHaveLength(1);
    });
  });

  describe("calculatePortalSummaryStats", () => {
    it("aggregates request and post metrics accurately", () => {
      const requests = [
        { status: "in_review" },
        { status: "changes_requested" },
        { status: "approved" },
      ];
      const posts = [
        { status: "scheduled", channels: [{ platform: "instagram" }, { platform: "x" }] },
        { status: "scheduled", channels: [{ platform: "linkedin" }] },
        { status: "published", channels: [{ platform: "instagram" }] },
      ];

      const stats = calculatePortalSummaryStats(requests, posts);
      expect(stats.pendingReviewCount).toBe(2);
      expect(stats.upcomingScheduledCount).toBe(2);
      expect(stats.publishedCount).toBe(1);
      expect(stats.totalChannels).toBe(3);
    });
  });
});
