import { describe, it, expect } from "vitest";
import { classifyMessage, generateSuggestedReply } from "./inbox-triage";

describe("AI Inbox Triage", () => {
  describe("classifyMessage", () => {
    it("flags spam messages correctly", () => {
      const result = classifyMessage("DM me to earn 5000$ in crypto right now! Click here: http://bit.ly/scam");
      expect(result.category).toBe("spam");
      expect(result.priority).toBe(3);
    });

    it("detects urgent issues and sets P0 priority", () => {
      const result = classifyMessage("CRITICAL: Our production site is down and API is failing ASAP!");
      expect(result.category).toBe("urgent");
      expect(result.priority).toBe(0);
      expect(result.sentiment).toBe("negative");
    });

    it("categorizes customer complaints", () => {
      const result = classifyMessage("This is terrible service. I want a refund, unacceptable!");
      expect(result.category).toBe("complaint");
      expect(result.sentiment).toBe("negative");
    });

    it("identifies sales inquiries", () => {
      const result = classifyMessage("How much does the enterprise quote cost? Interested in demo.");
      expect(result.category).toBe("sales");
      expect(result.sentiment).toBe("positive");
    });

    it("detects technical support issues", () => {
      const result = classifyMessage("Encountered a bug where login failed with error 500.");
      expect(result.category).toBe("support");
      expect(result.sentiment).toBe("negative");
    });

    it("categorizes general questions and feedback", () => {
      const question = classifyMessage("How do I connect my Bluesky account?");
      expect(question.category).toBe("question");

      const positive = classifyMessage("Love this new feature, thank you so much team!");
      expect(positive.category).toBe("question");
      expect(positive.sentiment).toBe("positive");
    });
  });

  describe("generateSuggestedReply", () => {
    it("generates personalized replies tailored to category", () => {
      const urgentReply = generateSuggestedReply({
        category: "urgent",
        text: "System is down!",
        authorName: "Alice Smith",
        platform: "x",
      });
      expect(urgentReply).toContain("Alice");
      expect(urgentReply).toContain("immediate attention");

      const salesReply = generateSuggestedReply({
        category: "sales",
        text: "What are your plans?",
        authorName: "Bob Johnson",
        platform: "linkedin",
      });
      expect(salesReply).toContain("Bob");
      expect(salesReply).toContain("pricing");
    });

    it("returns empty reply for spam", () => {
      const spamReply = generateSuggestedReply({
        category: "spam",
        text: "crypto telegram bot",
        authorName: "Spammer",
        platform: "instagram",
      });
      expect(spamReply).toBe("");
    });
  });
});
