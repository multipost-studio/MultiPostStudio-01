import { describe, it, expect } from "vitest";
import { NAV, SETTINGS_NAV } from "@/lib/nav";
import { parseIntent, stem, terms, words, type IntentId, type RouteEntry } from "./intents";

const routes: RouteEntry[] = [
  ...NAV.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href }))),
  ...SETTINGS_NAV.map((s) => ({ label: s.label, href: s.href })),
];
const ask = (q: string) => parseIntent(q, routes);
const intentOf = (q: string): IntentId => ask(q).intent;

describe("normalisation", () => {
  it("lowercases, drops punctuation and apostrophes", () => {
    expect(words("What's scheduled TODAY?!")).toEqual(["whats", "scheduled", "today"]);
    expect(words("Didn't publish")).toEqual(["didnt", "publish"]);
  });

  it("stems plurals and common suffixes consistently", () => {
    expect(stem("posts")).toBe("post");
    expect(stem("accounts")).toBe("account");
    expect(stem("queries")).toBe("query");
    expect(stem("failed")).toBe("fail");
    expect(stem("scheduling")).toBe("schedul");
    expect(stem("business")).toBe("business");
  });

  it("removes filler words", () => {
    expect(terms("can you show me my failed posts please")).toEqual(["fail", "post"]);
  });
});

describe("data questions", () => {
  it.each([
    ["What's scheduled today?", "today"],
    ["anything going out tonight", "today"],
    ["what posts are lined up today", "today"],
    ["what's scheduled for tomorrow", "tomorrow"],
    ["show me tomorrow's posts", "tomorrow"],
    ["what's coming up this week", "week"],
    ["what is scheduled for the upcoming week", "week"],
    ["any failed posts?", "failed"],
    ["why didn't my post publish", "failed"],
    ["something went wrong with publishing", "failed"],
    ["what posts have errors", "failed"],
    ["when is the best time to post", "best_time"],
    ["when should I post?", "best_time"],
    ["what's my posting streak", "streak"],
    ["am I close to a milestone", "streak"],
    ["anything waiting for my review", "approvals"],
    ["pending approvals", "approvals"],
    ["do I have unread messages", "inbox"],
    ["any comments to reply to", "inbox"],
    ["are my accounts connected", "accounts"],
    ["do any tokens expire soon", "accounts"],
    ["how many ai credits do I have left", "usage"],
    ["am I near my plan limit", "usage"],
    ["what's my social health score", "health"],
    ["how am I doing this week", "performance"],
    ["how are my followers growing", "performance"],
    ["what should I focus on today", "briefing"],
    ["catch me up", "briefing"],
    ["anything urgent?", "briefing"],
    ["I want to write a new post", "create"],
    ["hi", "greeting"],
    ["hello there", "greeting"],
    ["thanks!", "thanks"],
    ["thank you so much", "thanks"],
  ] as const)("%s -> %s", (q, expected) => {
    expect(intentOf(q)).toBe(expected);
  });
});

describe("navigation", () => {
  it.each([
    ["open the calendar", "/calendar"],
    ["calendar", "/calendar"],
    ["take me to billing", "/settings/billing"],
    ["go to the inbox", "/inbox"],
    ["integrations", "/integrations"],
    ["open media library", "/media"],
    ["go to analytics", "/analytics"],
    ["team", "/team"],
    ["show security settings", "/settings/security"],
  ] as const)("%s -> %s", (q, href) => {
    const r = ask(q);
    expect(r.intent).toBe("navigate");
    expect(r.route?.href).toBe(href);
  });
});

describe("how-do-I questions", () => {
  it.each([
    ["how do I connect instagram", "connect"],
    ["how can I schedule a post for later", "schedule"],
    ["how do I invite a teammate", "team"],
    ["where can I change my plan", "billing"],
    ["how to turn on two factor", "security"],
    ["how do I make a client report", "reports"],
    ["how do I import posts from a csv", "calendar_import"],
    ["why can't I publish, it says too long", "platform_limits"],
    ["how do I recycle evergreen posts", "recycling"],
    ["how do I get approvals from my client", "approvals"],
  ] as const)("%s -> topic %s", (q, topic) => {
    const r = ask(q);
    expect(r.intent).toBe("help");
    expect(r.topic?.id).toBe(topic);
  });
});

describe("honesty", () => {
  it("says unknown, with low confidence, for gibberish and off-topic questions", () => {
    for (const q of ["asdf qwerty zxcv", "what's the capital of france", "tell me a joke about whales"]) {
      const r = ask(q);
      expect(["unknown"]).toContain(r.intent);
      expect(r.confidence).toBeLessThan(0.45);
    }
  });

  it("returns unknown for empty input", () => {
    expect(ask("   ").intent).toBe("unknown");
    expect(ask("???").intent).toBe("unknown");
  });

  it("offers suggestions when it is unsure", () => {
    const r = ask("something about accounts maybe");
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("does not treat a greeting word inside a real question as a greeting", () => {
    expect(intentOf("hey what's scheduled today")).toBe("today");
  });

  it("keeps confidence in 0..1", () => {
    for (const q of ["what's scheduled today", "hi", "open calendar", "how do I connect instagram", "zzz"]) {
      const c = ask(q).confidence;
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
  });
});
