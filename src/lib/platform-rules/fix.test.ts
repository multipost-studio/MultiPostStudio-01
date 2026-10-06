import { describe, expect, it } from "vitest";
import { DEFAULT_RULESET, validateText } from "./index";
import { appendHashtag, planHashtagFix, planKeepFirst, removeHashtag } from "./fix";
import { proposeAdaptation } from "./adapt";

const check = (body: string, firstComment = "") =>
  validateText(DEFAULT_RULESET, { platform: "instagram", contentType: "post", body, firstComment });

describe("fix plans", () => {
  it("plans the exact removal an issue points at, without applying it", () => {
    const body = "Hello #a #b #c #d #e #f #g";
    const issue = check(body).issues[0];
    const plan = planHashtagFix(issue, { body, firstComment: "" });
    expect(plan?.removed).toEqual(["#f", "#g"]);
    expect(plan?.body).toBe("Hello #a #b #c #d #e");
    expect(body).toBe("Hello #a #b #c #d #e #f #g"); // input untouched
    // applying the plan really satisfies the rule
    expect(check(plan!.body).issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("removes surplus tags from the first comment first, and reports where", () => {
    const body = "x #a #b #c";
    const comment = "#d #e #f";
    const issue = check(body, comment).issues[0];
    const plan = planHashtagFix(issue, { body, firstComment: comment });
    expect(plan?.field).toBe("firstComment");
    expect(plan?.body).toBe(body);
    expect(plan?.removed).toEqual(["#f"]);
  });

  it("returns null when the issue has no hashtag fix", () => {
    const issue = validateText(DEFAULT_RULESET, { platform: "instagram", contentType: "post", body: "a".repeat(2300) }).issues[0];
    expect(planHashtagFix(issue, { body: "a", firstComment: "" })).toBeNull();
  });

  it("keep-first-N removes only the tail, in order of appearance", () => {
    const plan = planKeepFirst({ body: "t #one #two #three #four #five #six", firstComment: "" }, 5);
    expect(plan?.removed).toEqual(["#six"]);
    expect(plan?.body).toBe("t #one #two #three #four #five");
    expect(planKeepFirst({ body: "#a #b", firstComment: "" }, 5)).toBeNull();
  });
});

describe("appendHashtag / removeHashtag", () => {
  it("adds to the trailing hashtag line, or starts a new paragraph", () => {
    expect(appendHashtag("Hello world", "saas")).toBe("Hello world\n\n#saas");
    expect(appendHashtag("Hello\n\n#a #b", "#c")).toBe("Hello\n\n#a #b #c");
    expect(appendHashtag("", "x")).toBe("#x");
  });
  it("rejects invalid or duplicate tags", () => {
    expect(appendHashtag("hi #saas", "SaaS")).toBe("hi #saas");
    expect(appendHashtag("hi", "123")).toBe("hi");
    expect(appendHashtag("hi", "   ")).toBe("hi");
    expect(appendHashtag("hi", "a b!c")).toBe("hi\n\n#abc");
  });
  it("removes every occurrence of a tag, case-insensitively, leaving urls alone", () => {
    expect(removeHashtag("a #Foo b #foo c https://x.com/#foo", "#FOO")).toBe("a b c https://x.com/#foo");
  });
});

describe("proposeAdaptation", () => {
  it("trims surplus hashtags, lists exactly what it removed, and never truncates length", () => {
    const adapted = `${"a".repeat(2250)} #a #b #c #d #e #f #g`;
    const p = proposeAdaptation(DEFAULT_RULESET, { platform: "instagram", contentType: "post", before: "short", adapted });
    expect(p.removedTags).toEqual(["#f", "#g"]);
    expect(p.changes[0]).toContain("Removed 2 hashtags over the 5-hashtag limit: #f #g");
    expect(p.after.startsWith("a".repeat(2250))).toBe(true); // content untouched
    expect(p.remainingErrors.join(" ")).toContain("2,200"); // still too long: reported, not cut
    expect(p.length?.unit).toBe("characters");
  });
  it("reports nothing to change when the adaptation already fits", () => {
    const p = proposeAdaptation(DEFAULT_RULESET, { platform: "bluesky", contentType: "post", before: "x".repeat(400), adapted: "short and sweet" });
    expect(p.removedTags).toEqual([]);
    expect(p.remainingErrors).toEqual([]);
    expect(p.changes).toEqual(["Length: 400 → 15 graphemes"]);
  });
});
