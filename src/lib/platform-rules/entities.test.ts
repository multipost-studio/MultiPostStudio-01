import { describe, expect, it } from "vitest";
import { findHashtags, findMentions, findUrls, removeSpans, uniqueHashtags } from "./entities";

describe("findHashtags", () => {
  it("finds plain, mixed-case, unicode and underscore tags", () => {
    const tags = findHashtags("Launch day #saas #Startup #AI #growth_hacking #café #日本語");
    expect(tags.map((t) => t.text)).toEqual(["#saas", "#Startup", "#AI", "#growth_hacking", "#café", "#日本語"]);
  });

  it("reports exact spans in the original text", () => {
    const text = "a #one b #two";
    for (const h of findHashtags(text)) expect(text.slice(h.start, h.end)).toBe(h.text);
  });

  it("ignores url fragments, anchors in urls, emails, numbers and bare #", () => {
    expect(findHashtags("read https://x.com/p#section now")).toHaveLength(0);
    expect(findHashtags("mail me@host.com or a&#39;b")).toHaveLength(0);
    expect(findHashtags("item #123 and # alone and ##")).toHaveLength(0);
    expect(findHashtags("path/#frag")).toHaveLength(0);
  });

  it("handles tags at line starts, after punctuation and adjacent to emoji", () => {
    expect(findHashtags("#first\n(#second) \"#third\" 🔥#fourth")).toHaveLength(4);
  });

  it("dedupes case-insensitively for counting", () => {
    expect(uniqueHashtags("#AI #ai #Ai #ml")).toHaveLength(2);
  });
});

describe("findMentions", () => {
  it("finds handles, including dotted bluesky handles, but not emails", () => {
    expect(findMentions("hi @bob and @alice.bsky.social, mail a@b.com").map((m) => m.text)).toEqual(["@bob", "@alice.bsky.social"]);
  });
});

describe("findUrls", () => {
  it("finds links and trims trailing punctuation", () => {
    expect(findUrls("go to https://a.com/x, or www.b.org.").map((u) => u.text)).toEqual(["https://a.com/x", "www.b.org"]);
  });
});

describe("removeSpans", () => {
  it("removes exact spans and tidies whitespace", () => {
    const text = "Hello #a world #b end";
    const tags = findHashtags(text);
    expect(removeSpans(text, [tags[1]])).toBe("Hello #a world end");
    expect(removeSpans(text, tags)).toBe("Hello world end");
  });
});
