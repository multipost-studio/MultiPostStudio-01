import { describe, it, expect } from "vitest";
import { brandLine, synthesizeBrandVoice, type BrandContext, type AiTrace } from "./adapters/ai";

describe("brandLine", () => {
  it("returns empty string when context is undefined", () => {
    expect(brandLine(undefined)).toBe("");
  });

  it("uses default voice when no platform override is set", () => {
    const context: BrandContext = {
      name: "Acme Corp",
      voice: "Bold, cheeky, tech-savvy",
      industry: "SaaS",
    };

    const line = brandLine(context);
    expect(line).toContain("Brand: Acme Corp.");
    expect(line).toContain("Voice: Bold, cheeky, tech-savvy.");
    expect(line).toContain("Industry: SaaS.");
  });

  it("applies platform-specific tone override when matching platform is provided", () => {
    const context: BrandContext = {
      name: "Acme Corp",
      voice: "Generic corporate",
      tones: {
        linkedin: "Insightful, data-driven, executive thought-leadership",
        x: "Punchy, sarcastic, rapid-fire",
      },
    };

    const linkedinLine = brandLine(context, "linkedin");
    expect(linkedinLine).toContain("Voice: Insightful, data-driven, executive thought-leadership.");

    const xLine = brandLine(context, "x");
    expect(xLine).toContain("Voice: Punchy, sarcastic, rapid-fire.");

    const igLine = brandLine(context, "instagram");
    // Fallback to voice when platform has no specific tone override
    expect(igLine).toContain("Voice: Generic corporate.");
  });

  it("injects vocabulary, avoidWords, emojiStyle, and ctaStyle preferences", () => {
    const context: BrandContext = {
      name: "Acme",
      preferences: {
        vocabulary: ["streamline", "leverage", "clarity"],
        avoidWords: ["viral", "cheap", "growth-hack"],
        emojiStyle: "Minimal (1-2 per post)",
        ctaStyle: "Ask an engaging question",
        hashtagStrategy: "Max 3 industry tags",
      },
    };

    const line = brandLine(context);
    expect(line).toContain("Preferred words: streamline, leverage, clarity.");
    expect(line).toContain("Words to avoid: viral, cheap, growth-hack.");
    expect(line).toContain("Emoji style: Minimal (1-2 per post).");
    expect(line).toContain("Call-to-action style: Ask an engaging question.");
    expect(line).toContain("Hashtag strategy: Max 3 industry tags.");
  });

  it("limits preferred vocabulary and avoid words to 15 items to prevent prompt bloat", () => {
    const words = Array.from({ length: 30 }, (_, i) => `word${i}`);
    const context: BrandContext = {
      name: "Acme",
      preferences: {
        vocabulary: words,
        avoidWords: words,
      },
    };

    const line = brandLine(context);
    expect(line).toContain("Preferred words: " + words.slice(0, 15).join(", ") + ".");
    expect(line).not.toContain("word15");
    expect(line).not.toContain("word29");
  });
});

describe("synthesizeBrandVoice", () => {
  it("generates deterministic fallback voice profile when offline/no api key", async () => {
    const trace: AiTrace = { usedModel: false };
    const sampleSources = [
      {
        title: "About Us",
        kind: "document",
        content:
          "Acme builds exceptional developer productivity workflows. Productivity, innovation, craftsmanship, and performance drive everything we build. Our mission is seamless developer experience.",
      },
      {
        title: "Blog Guidelines",
        kind: "guidelines",
        content:
          "We value craftsmanship, innovation, and direct communication. Always avoid fluff, buzzwords, and vague promises. Focus on developer performance.",
      },
    ];

    const profile = await synthesizeBrandVoice("Acme Inc", sampleSources, trace);

    expect(trace.usedModel).toBe(false);
    expect(profile.voiceSummary).toContain("Acme Inc communicates with an authoritative yet accessible voice");
    expect(profile.tones.instagram).toBeDefined();
    expect(profile.tones.linkedin).toBeDefined();
    expect(profile.tones.x).toBeDefined();
    expect(profile.preferences.avoidWords).toContain("viral");
    expect(profile.preferences.avoidWords).toContain("synergy");
    expect(profile.preferences.vocabulary.length).toBeGreaterThan(0);
    // Should extract frequent words like craftsmanship, innovation, developer, productivity
    const combinedVocab = profile.preferences.vocabulary.join(" ");
    expect(
      combinedVocab.includes("craftsmanship") ||
      combinedVocab.includes("innovation") ||
      combinedVocab.includes("productivity") ||
      combinedVocab.includes("developer")
    ).toBe(true);
  });
});
