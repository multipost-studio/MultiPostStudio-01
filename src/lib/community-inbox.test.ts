import { describe, it, expect } from "vitest";
import {
  expandSavedReply,
  calculateUrgencyScore,
  filterAndSortConversations,
  calculateInboxMetrics,
  ConversationItem,
} from "./community-inbox";

describe("community-inbox domain logic", () => {
  describe("expandSavedReply", () => {
    it("interpolates author name, handle, platform, and workspace variables", () => {
      const template = "Hi {{name}} (@{{handle}}), thanks for reaching out on {{platform}}! - {{workspace}}";
      const result = expandSavedReply(template, {
        authorName: "Sarah Connor",
        authorHandle: "sconnor",
        platform: "x",
        workspaceName: "Acme Studio",
      });
      expect(result).toBe("Hi Sarah Connor (@sconnor), thanks for reaching out on X! - Acme Studio");
    });

    it("handles {{first_name}} placeholder", () => {
      const template = "Hello {{first_name}}, how can we help?";
      const result = expandSavedReply(template, { authorName: "Alex Rivera" });
      expect(result).toBe("Hello Alex, how can we help?");
    });

    it("falls back gracefully when variables are missing or null", () => {
      const template = "Hi {{name}} from {{workspace}}!";
      const result = expandSavedReply(template, { authorName: null, workspaceName: undefined });
      expect(result).toBe("Hi there from our team!");
    });
  });

  describe("calculateUrgencyScore", () => {
    it("awards high urgency to negative sentiment, VIP tags, and high priority", () => {
      const urgentItem: ConversationItem = {
        id: "1",
        platform: "x",
        type: "comment",
        authorName: "John",
        authorHandle: "john",
        preview: "This broke completely!",
        status: "open",
        sentiment: "negative",
        priority: 3,
        rating: null,
        labels: ["VIP", "bug"],
        assignee: null,
        lastMessageAt: new Date().toISOString(),
      };

      const calmItem: ConversationItem = {
        id: "2",
        platform: "instagram",
        type: "comment",
        authorName: "Jane",
        authorHandle: "jane",
        preview: "Love the post!",
        status: "done",
        sentiment: "positive",
        priority: 0,
        rating: 5,
        labels: ["fan"],
        assignee: { id: "u1", name: "Agent" },
        lastMessageAt: new Date().toISOString(),
      };

      const scoreUrgent = calculateUrgencyScore(urgentItem);
      const scoreCalm = calculateUrgencyScore(calmItem);

      expect(scoreUrgent).toBeGreaterThan(scoreCalm);
      expect(scoreUrgent).toBe(3 * 15 + 25 + 20 + 10); // 100
      expect(scoreCalm).toBe(0);
    });
  });

  describe("filterAndSortConversations", () => {
    const mockItems: ConversationItem[] = [
      {
        id: "c1",
        platform: "x",
        type: "comment",
        authorName: "Alice Smith",
        authorHandle: "alice",
        preview: "Can you help with refund?",
        status: "open",
        sentiment: "negative",
        priority: 3,
        rating: null,
        labels: ["billing"],
        assignee: null,
        lastMessageAt: "2026-09-21T10:00:00Z",
      },
      {
        id: "c2",
        platform: "instagram",
        type: "comment",
        authorName: "Bob Jones",
        authorHandle: "bobjones",
        preview: "Great work team!",
        status: "open",
        sentiment: "positive",
        priority: 0,
        rating: null,
        labels: ["vip"],
        assignee: null,
        lastMessageAt: "2026-09-21T12:00:00Z",
      },
      {
        id: "c3",
        platform: "linkedin",
        type: "comment",
        authorName: "Charlie Brown",
        authorHandle: "charlie",
        preview: "Nice insightful article",
        status: "done",
        sentiment: "neutral",
        priority: 0,
        rating: null,
        labels: [],
        assignee: { id: "u1", name: "Sarah" },
        lastMessageAt: "2026-09-21T08:00:00Z",
      },
    ];

    it("filters by status and sentiment", () => {
      const openNegative = filterAndSortConversations(mockItems, {
        status: "open",
        sentiment: "negative",
      });
      expect(openNegative).toHaveLength(1);
      expect(openNegative[0].id).toBe("c1");
    });

    it("filters by platform and label", () => {
      const igVip = filterAndSortConversations(mockItems, {
        status: "open",
        platform: "instagram",
        label: "vip",
      });
      expect(igVip).toHaveLength(1);
      expect(igVip[0].id).toBe("c2");
    });

    it("filters by search query across author and preview", () => {
      const searchRes = filterAndSortConversations(mockItems, {
        status: "all",
        searchQuery: "refund",
      });
      expect(searchRes).toHaveLength(1);
      expect(searchRes[0].id).toBe("c1");
    });

    it("sorts by priority_desc placing urgent conversations first", () => {
      const sorted = filterAndSortConversations(mockItems, {
        status: "all",
        sort: "priority_desc",
      });
      expect(sorted[0].id).toBe("c1"); // c1 has negative sentiment + priority 3
    });
  });

  describe("calculateInboxMetrics", () => {
    it("computes totals, status breakdown, and sentiment breakdown", () => {
      const mockItems: ConversationItem[] = [
        {
          id: "1",
          platform: "x",
          type: "comment",
          authorName: "A",
          authorHandle: "a",
          preview: "msg",
          status: "open",
          sentiment: "positive",
          priority: 0,
          rating: null,
          labels: [],
          assignee: null,
          lastMessageAt: "2026-09-21T10:00:00Z",
        },
        {
          id: "2",
          platform: "x",
          type: "comment",
          authorName: "B",
          authorHandle: "b",
          preview: "msg",
          status: "done",
          sentiment: "negative",
          priority: 3,
          rating: null,
          labels: [],
          assignee: null,
          lastMessageAt: "2026-09-21T10:00:00Z",
        },
      ];

      const metrics = calculateInboxMetrics(mockItems);
      expect(metrics.total).toBe(2);
      expect(metrics.open).toBe(1);
      expect(metrics.done).toBe(1);
      expect(metrics.positive).toBe(1);
      expect(metrics.negative).toBe(1);
      expect(metrics.highPriority).toBe(1);
    });
  });
});
