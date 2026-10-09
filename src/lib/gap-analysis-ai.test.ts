import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ flags: { aiByok: true, realAI: false }, generate: vi.fn() }));

vi.mock("@/lib/env", () => ({
  env: {},
  get flags() {
    return m.flags;
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/ai/orchestrator", () => ({ generateTextDetailed: (...a: unknown[]) => m.generate(...a) }));

import { buildGapPrompt, formatGapSummary, generateGapAnalysis, parseGapNarrative } from "./competitor-intelligence";
import { gapAnalysisAsync, type AiTrace } from "./adapters/ai";

const input = {
  myFollowers: 1200,
  myPostsPerWeek: 3,
  myEr: 2.4,
  competitor: { name: "Rival Co", platform: "instagram", followerCount: 9000, postsPerWeek: 7, avgEngagement: 3.1, posts: [{ caption: "Autumn sale  is   live", format: "reel" }] },
};

const GOOD = `SUMMARY: Rival Co out-posts and out-engages you.
OPPORTUNITIES:
- Post 7 times a week like Rival Co.
- Try reels, their recorded format.
THREATS:
- They have 7x your followers.
RECOMMENDATION: Add two reels a week for a month and compare engagement.`;

beforeEach(() => {
  vi.clearAllMocks();
  m.flags.aiByok = true;
});

describe("parseGapNarrative", () => {
  it("reads the agreed shape", () => {
    const r = parseGapNarrative(GOOD)!;
    expect(r.summary).toBe("Rival Co out-posts and out-engages you.");
    expect(r.opportunities).toEqual(["Post 7 times a week like Rival Co.", "Try reels, their recorded format."]);
    expect(r.threats).toEqual(["They have 7x your followers."]);
    expect(r.recommendedAction).toContain("two reels");
  });

  it("accepts numbered and starred bullets, and treats 'none' as no threats", () => {
    const r = parseGapNarrative("SUMMARY: ok\nOPPORTUNITIES:\n1. a\n2) b\n* c\n* d\nTHREATS:\n- none\nRECOMMENDATION: go")!;
    expect(r.opportunities).toEqual(["a", "b", "c"]);
    expect(r.threats).toEqual([]);
  });

  it("rejects anything not in the shape, so the caller falls back", () => {
    expect(parseGapNarrative("Sure! Here's my analysis of your competitor...")).toBeNull();
    expect(parseGapNarrative("SUMMARY: x\nOPPORTUNITIES:\nTHREATS:\n- y\nRECOMMENDATION: z")).toBeNull();
    expect(parseGapNarrative("")).toBeNull();
  });
});

describe("prompt and summary", () => {
  it("gives the model only the user's real figures and forbids inventing more", () => {
    const base = generateGapAnalysis(input);
    const p = buildGapPrompt({ ...input, baseline: base });
    expect(p.system).toMatch(/never invent/i);
    expect(p.user).toContain("1,200 followers");
    expect(p.user).toContain("Rival Co on instagram: 9,000 followers, 7.0 posts/week, 3.10%");
    expect(p.user).toContain("[reel] Autumn sale is live");
  });

  it("labels the source honestly", () => {
    const a = generateGapAnalysis(input);
    expect(formatGapSummary(a, "ai")).toContain("Written by your connected AI model");
    expect(formatGapSummary(a, "rules")).toContain("no AI model was used");
    expect(formatGapSummary(a, "rules")).toContain("Opportunities:");
  });
});

describe("gapAnalysisAsync", () => {
  it("uses the model's answer when it is well formed, and says so in the trace", async () => {
    m.generate.mockResolvedValue({ text: GOOD, provider: "openai" });
    const trace: AiTrace = { usedModel: false };
    const r = await gapAnalysisAsync("w1", input, trace);
    expect(r.summary).toBe("Rival Co out-posts and out-engages you.");
    expect(trace.usedModel).toBe(true);
  });

  it("falls back to the rule-based comparison when no key is connected", async () => {
    m.generate.mockResolvedValue({ text: null, reason: "no_key" });
    const trace: AiTrace = { usedModel: false };
    const r = await gapAnalysisAsync("w1", input, trace);
    expect(r).toEqual(generateGapAnalysis(input));
    expect(trace).toMatchObject({ usedModel: false, fallback: "no_key" });
  });

  it("falls back, and does not claim AI, when the model rambles", async () => {
    m.generate.mockResolvedValue({ text: "I think you should post more!", provider: "openai" });
    const trace: AiTrace = { usedModel: false };
    const r = await gapAnalysisAsync("w1", input, trace);
    expect(r).toEqual(generateGapAnalysis(input));
    expect(trace.usedModel).toBe(false);
  });
});
