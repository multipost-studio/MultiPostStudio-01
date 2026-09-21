import { describe, it, expect } from "vitest";
import {
  calculateVelocityBenchmark,
  extractCompetitorTopics,
  generateGapAnalysis,
} from "./competitor-intelligence";

describe("Competitor Intelligence", () => {
  describe("calculateVelocityBenchmark", () => {
    it("computes accurate follower ratios and engagement yield", () => {
      const result = calculateVelocityBenchmark({
        myFollowers: 10000,
        myPostsPerWeek: 5,
        myEr: 3.5,
        competitor: {
          followerCount: 20000,
          postsPerWeek: 4,
          avgEngagement: 2.0,
        },
      });

      expect(result.followerRatio).toBe(50);
      expect(result.frequencyDifference).toBe(1);
      expect(result.engagementYield).toBe(175);
      expect(result.status).toBe("competitive");
    });

    it("handles trailing and leading scenarios", () => {
      const leading = calculateVelocityBenchmark({
        myFollowers: 50000,
        myPostsPerWeek: 7,
        myEr: 5.0,
        competitor: {
          followerCount: 10000,
          postsPerWeek: 2,
          avgEngagement: 1.5,
        },
      });
      expect(leading.status).toBe("leading");

      const trailing = calculateVelocityBenchmark({
        myFollowers: 1000,
        myPostsPerWeek: 1,
        myEr: 0.5,
        competitor: {
          followerCount: 100000,
          postsPerWeek: 10,
          avgEngagement: 4.0,
        },
      });
      expect(trailing.status).toBe("trailing");
    });
  });

  describe("extractCompetitorTopics", () => {
    it("extracts recurring keywords and associates formats", () => {
      const posts = [
        { caption: "Announcing our new coffee blend roaster machine launch!", format: "carousel" },
        { caption: "Behind the scenes at the roaster with our head of coffee", format: "reel" },
        { caption: "How to grind coffee properly for espresso machines", format: "image" },
      ];

      const topics = extractCompetitorTopics(posts);
      expect(topics.length).toBeGreaterThan(0);
      const coffeeTopic = topics.find((t) => t.keyword === "coffee");
      expect(coffeeTopic).toBeDefined();
      expect(coffeeTopic?.count).toBe(3);
      expect(coffeeTopic?.formats).toContain("carousel");
    });
  });

  describe("generateGapAnalysis", () => {
    it("generates structured opportunities, threats, and action recommendations", () => {
      const analysis = generateGapAnalysis({
        myFollowers: 15000,
        myPostsPerWeek: 4,
        myEr: 4.2,
        competitor: {
          name: "Acme Brand",
          followerCount: 50000,
          postsPerWeek: 6,
          avgEngagement: 2.1,
        },
      });

      expect(analysis.summary).toContain("Acme Brand");
      expect(analysis.opportunities.length).toBeGreaterThan(0);
      expect(analysis.threats.length).toBeGreaterThan(0);
      expect(analysis.recommendedAction).toBeDefined();
    });
  });
});
