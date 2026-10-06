import { describe, expect, it } from "vitest";
import { buildRuleSet, DEFAULT_RULES, DEFAULT_RULESET, readinessOf, validateText, type PlatformRule } from "./index";
import { removeSpans } from "./entities";

const tags = (n: number) => Array.from({ length: n }, (_, i) => `#tag${i + 1}`).join(" ");
const v = (platform: string, contentType: string, body: string, extra: { firstComment?: string; tier?: "standard" | "premium" | "unknown" } = {}) =>
  validateText(DEFAULT_RULESET, { platform, contentType, body, firstComment: extra.firstComment, context: { tier: extra.tier } });
const codes = (r: ReturnType<typeof v>, sev?: string) => r.issues.filter((i) => !sev || i.severity === sev).map((i) => i.code);

describe("Instagram", () => {
  it("allows 5 hashtags, blocks 6 and 7 with an exact count", () => {
    expect(codes(v("instagram", "post", `Hi ${tags(5)}`), "error")).toEqual([]);
    const six = v("instagram", "post", `Hi ${tags(6)}`);
    expect(codes(six, "error")).toEqual(["hashtags.max"]);
    expect(six.issues[0].message).toContain("allows up to 5 hashtags");
    expect(six.issues[0].message).toContain("currently have 6");
    expect(six.issues[0].message).toContain("Remove 1 hashtag");
    expect(v("instagram", "post", `Hi ${tags(7)}`).issues[0].message).toContain("Remove 2 hashtags");
    expect(six.metrics.hashtags).toEqual({ count: 6, limit: 5, recommended: null });
  });

  it("checks the 2,200 boundary", () => {
    expect(codes(v("instagram", "post", "a".repeat(2200)), "error")).toEqual([]);
    expect(codes(v("instagram", "post", "a".repeat(2201)), "error")).toEqual(["text.max"]);
    expect(v("instagram", "post", "a".repeat(2000)).metrics.text).toMatchObject({ count: 2000, limit: 2200 });
  });

  it("counts hashtags in the first comment too — moving them is not a bypass", () => {
    const r = v("instagram", "post", `Caption ${tags(3)}`, { firstComment: "#extra1 #extra2 #extra3" });
    expect(codes(r, "error")).toEqual(["hashtags.max"]);
    expect(r.issues[0].message).toContain("caption and first comment");
  });

  it("does not double count a tag used in both places or in a different case", () => {
    expect(codes(v("instagram", "post", "#A #b #c #d", { firstComment: "#a #B #e" }), "error")).toEqual([]);
  });

  it("offers a fix that removes exactly the surplus tags, and nothing else", () => {
    const body = "Launch #one #two #three #four #five #six #seven now";
    const r = v("instagram", "post", body);
    const fix = r.issues[0].fix;
    expect(fix?.type).toBe("remove_hashtags");
    if (fix?.type !== "remove_hashtags") return;
    expect(fix.spans.map((s) => s.text)).toEqual(["#six", "#seven"]);
    expect(removeSpans(body, fix.spans)).toBe("Launch #one #two #three #four #five now");
  });

  it("flags more than 20 mentions", () => {
    expect(codes(v("instagram", "post", Array.from({ length: 21 }, (_, i) => `@u${i}`).join(" ")), "error")).toEqual(["mentions.max"]);
  });

  it("ignores hashtag-like text in urls and emails", () => {
    expect(codes(v("instagram", "post", `${tags(5)} see https://x.com/p#a#b#c and me@a.com`), "error")).toEqual([]);
  });
});

describe("Threads", () => {
  it("allows one topic tag and blocks two", () => {
    expect(codes(v("threads", "post", "hello #one"), "error")).toEqual([]);
    const two = v("threads", "post", "hello #one #two");
    expect(codes(two, "error")).toEqual(["topicTags.max"]);
    expect(two.issues[0].message).toContain("only 1 topic tag");
  });
  it("does not treat topic tags as an Instagram-style hashtag cap", () => {
    expect(v("threads", "post", "x").metrics.hashtags).toBeNull();
  });
  it("counts emoji as UTF-8 bytes against the 500 limit", () => {
    expect(codes(v("threads", "post", "😀".repeat(125)), "error")).toEqual([]); // 125 × 4 = 500
    expect(codes(v("threads", "post", "😀".repeat(126)), "error")).toEqual(["text.max"]);
  });
  it("blocks more than 5 links", () => {
    const links = Array.from({ length: 6 }, (_, i) => `https://e.com/${i}`).join(" ");
    expect(codes(v("threads", "post", links), "error")).toEqual(["links.max"]);
  });
});

describe("X", () => {
  it("standard account: 280 passes, 281 fails with the account wording", () => {
    expect(codes(v("x", "post", "a".repeat(280), { tier: "standard" }), "error")).toEqual([]);
    const over = v("x", "post", "a".repeat(281), { tier: "standard" });
    expect(codes(over, "error")).toEqual(["text.max"]);
    expect(over.issues[0].message).toContain("This X account supports 280 characters. Your post contains 281 characters.");
  });
  it("premium account: 25,000 passes, 25,001 fails", () => {
    expect(codes(v("x", "post", "a".repeat(25000), { tier: "premium" }), "error")).toEqual([]);
    expect(codes(v("x", "post", "a".repeat(25001), { tier: "premium" }), "error")).toEqual(["text.max"]);
  });
  it("unknown tier falls back to 280 and says so, as information only", () => {
    const r = v("x", "post", "a".repeat(100));
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([["tier.unknown", "info"]]);
    expect(r.issues[0].message).toContain("could not be verified");
    expect(codes(v("x", "post", "a".repeat(281)), "error")).toEqual(["text.max"]);
    expect(readinessOf(r.issues)).toBe("ok");
  });
  it("counts a long link as 23", () => {
    const body = `${"a".repeat(250)} https://example.com/${"p".repeat(200)}`; // 250 + 1 + 23 = 274
    expect(codes(v("x", "post", body, { tier: "standard" }), "error")).toEqual([]);
    expect(v("x", "post", body, { tier: "standard" }).metrics.text?.count).toBe(274);
  });
  it("validates threads per post", () => {
    const thread = `${"a".repeat(280)}\n\n${"b".repeat(281)}`;
    const r = v("x", "thread", thread, { tier: "standard" });
    expect(r.issues.filter((i) => i.severity === "error")).toHaveLength(1);
    expect(r.issues[0].message).toContain("Thread post 2");
  });
});

describe("Bluesky", () => {
  it("counts graphemes: 300 passes, 301 fails", () => {
    expect(codes(v("bluesky", "post", "a".repeat(300)), "error")).toEqual([]);
    const over = v("bluesky", "post", "a".repeat(301));
    expect(codes(over, "error")).toEqual(["text.max"]);
    expect(over.issues[0].message).toContain("allows 300 graphemes");
    expect(over.issues[0].message).toContain("contains 301");
  });
  it("counts ZWJ emoji, flags and combining marks as single graphemes", () => {
    expect(codes(v("bluesky", "post", "👨‍👩‍👧‍👦".repeat(300)), "error")).toEqual([]);
    expect(codes(v("bluesky", "post", "👨‍👩‍👧‍👦".repeat(301)), "error")).toEqual(["text.max"]);
    expect(codes(v("bluesky", "post", "🇮🇳".repeat(300)), "error")).toEqual([]);
    expect(codes(v("bluesky", "post", "é".repeat(300)), "error")).toEqual([]);
    expect(codes(v("bluesky", "post", "你好".repeat(150)), "error")).toEqual([]);
  });
});

describe("TikTok", () => {
  it("measures UTF-16 runes: 2,200 passes, 2,201 fails", () => {
    expect(codes(v("tiktok", "video", "a".repeat(2200)), "error")).toEqual([]);
    expect(codes(v("tiktok", "video", "a".repeat(2201)), "error")).toEqual(["text.max"]);
  });
  it("counts an emoji as two runes", () => {
    expect(codes(v("tiktok", "video", "😀".repeat(1100)), "error")).toEqual([]);
    expect(codes(v("tiktok", "video", "😀".repeat(1101)), "error")).toEqual(["text.max"]);
  });
});

describe("YouTube", () => {
  it("title (first line): 100 passes, 101 fails", () => {
    expect(codes(v("youtube", "video", `${"t".repeat(100)}\nbody`), "error")).toEqual([]);
    expect(codes(v("youtube", "video", `${"t".repeat(101)}\nbody`), "error")).toEqual(["title.max"]);
  });
  it("description is measured in bytes", () => {
    expect(codes(v("youtube", "video", "a".repeat(5000)), "error")).not.toContain("description.max");
    expect(codes(v("youtube", "video", `title\n${"a".repeat(5000)}`), "error")).toContain("description.max");
    // 1,700 × 3-byte characters = 5,100 bytes but only 1,700 characters
    expect(codes(v("youtube", "video", "あ".repeat(1700)), "error")).toContain("description.max");
  });
  it("counts the #Shorts tag the publisher appends", () => {
    expect(codes(v("youtube", "short", `t
${"a".repeat(4990)}`), "error")).toEqual([]); // + "\n#Shorts" = 5000
    expect(codes(v("youtube", "short", `t
${"a".repeat(4991)}`), "error")).toContain("description.max");
  });
  it("hashtags: 60 pass, 61 are flagged as ignored", () => {
    expect(codes(v("youtube", "video", `t\n${tags(60)}`), "error")).toEqual([]);
    const r = v("youtube", "video", `t\n${tags(61)}`);
    expect(codes(r, "error")).toEqual(["hashtags.ignoredAbove"]);
    expect(r.issues[0].message).toContain("ignore every hashtag");
  });
});

describe("LinkedIn / Facebook / Pinterest never invent a hard hashtag cap", () => {
  it("LinkedIn: many hashtags is advice, not an error", () => {
    const r = v("linkedin", "post", `Post ${tags(12)}`);
    expect(codes(r, "error")).toEqual([]);
    expect(r.issues.find((i) => i.code === "hashtags.recommendedMax")).toMatchObject({ severity: "warning", kind: "RECOMMENDATION" });
    expect(readinessOf(r.issues)).toBe("warning");
    expect(r.issues[0].message).toContain("Recommended");
    expect(r.issues[0].message).toContain("not a LinkedIn limit");
  });
  it("LinkedIn: within the recommendation is clean", () => {
    expect(v("linkedin", "post", `Post ${tags(4)}`).issues).toEqual([]);
  });
  it("Facebook and Pinterest: any number of hashtags is silent", () => {
    expect(v("facebook", "post", tags(40)).issues).toEqual([]);
    expect(v("pinterest", "pin", `Title\n${tags(40)}`).issues).toEqual([]);
  });
  it("registers no blocking hashtag rule for them", () => {
    for (const p of ["linkedin", "facebook", "pinterest"]) {
      const hard = DEFAULT_RULES.filter((x) => x.platform === p && x.key.startsWith("hashtags") && x.kind !== "RECOMMENDATION");
      expect(hard, p).toEqual([]);
    }
  });
});

describe("Pinterest", () => {
  it("title 100 and description 800", () => {
    expect(codes(v("pinterest", "pin", `${"t".repeat(100)}\nd`), "error")).toEqual([]);
    expect(codes(v("pinterest", "pin", `${"t".repeat(101)}\nd`), "error")).toEqual(["title.max"]);
    expect(codes(v("pinterest", "pin", `t
${"a".repeat(798)}`), "error")).toEqual([]);
    expect(codes(v("pinterest", "pin", `t
${"a".repeat(799)}`), "error")).toEqual(["description.max"]);
  });
});

describe("rule kinds and verification", () => {
  it("an unverified rule can warn but never block", () => {
    const r = v("facebook", "post", "a".repeat(63207));
    expect(codes(r, "error")).toEqual([]);
    expect(codes(r, "warning")).toEqual(["text.max"]);
  });

  it("a recommendation never blocks even if an admin sets a tiny value", () => {
    const set = buildRuleSet(DEFAULT_RULES, [{ id: "linkedin.hashtags.recommendedMax", value: 1 }]);
    const r = validateText(set, { platform: "linkedin", contentType: "post", body: "#a #b #c" });
    expect(r.issues.map((i) => i.severity)).toEqual(["warning"]);
  });

  it("every default rule has a source, version and a kind", () => {
    for (const rule of DEFAULT_RULES as readonly PlatformRule[]) {
      expect(rule.source.name, rule.id).toBeTruthy();
      expect(rule.version, rule.id).toMatch(/^\d{4}-\d{2}$/);
      expect(["HARD_LIMIT", "API_LIMIT", "ACCOUNT_LIMIT", "RECOMMENDATION"]).toContain(rule.kind);
      if (rule.verification === "verified" && rule.kind !== "RECOMMENDATION") expect(rule.source.url, rule.id).toMatch(/^https:\/\//);
    }
  });

  it("rule ids are unique", () => {
    const ids = DEFAULT_RULES.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("admin overrides", () => {
  it("raising a value takes effect, and disabling a rule removes it", () => {
    const raised = buildRuleSet(DEFAULT_RULES, [{ id: "instagram.hashtags.max", value: 6 }]);
    expect(validateText(raised, { platform: "instagram", contentType: "post", body: tags(6) }).issues).toEqual([]);
    const off = buildRuleSet(DEFAULT_RULES, [{ id: "instagram.hashtags.max", enabled: false }]);
    expect(validateText(off, { platform: "instagram", contentType: "post", body: tags(30) }).issues).toEqual([]);
  });
  it("ignores nonsense override values and unknown ids", () => {
    const set = buildRuleSet(DEFAULT_RULES, [
      { id: "instagram.hashtags.max", value: -3 },
      { id: "nope.nope", value: 1 },
    ]);
    expect(set.rules.find((x) => x.id === "instagram.hashtags.max")?.value).toBe(5);
  });
});

describe("fallback for types without a rule", () => {
  it("uses the capability limit so no existing limit is lost", () => {
    const r = validateText(DEFAULT_RULESET, { platform: "linkedin", contentType: "article", body: "a".repeat(110001), fallbackLimit: 110000 });
    expect(codes(r, "error")).toEqual(["text.max"]);
  });
});
