import { describe, expect, it } from "vitest";
import { extractFaq, headingsOf, inlineText, parseInline, parseMarkdown, wordCount } from "./markdown";

describe("parseInline", () => {
  it("handles bold, italic, code and links", () => {
    const t = parseInline("a **b** and *c* with `d` and [e](https://x.com/y)");
    expect(t.map((n) => n.t)).toEqual(["text", "strong", "text", "em", "text", "code", "text", "link"]);
  });
  it("drops unsafe link targets but keeps the text", () => {
    const t = parseInline("[click](javascript:alert(1)) and [ok](/pricing)");
    expect(t.some((n) => n.t === "link" && n.href.startsWith("javascript"))).toBe(false);
    expect(inlineText(t)).toBe("click and ok");
    expect(t.filter((n) => n.t === "link")).toHaveLength(1);
  });
  it("leaves unmatched markers and snake_case alone", () => {
    expect(inlineText(parseInline("2 * 3 and my_var_name and **open"))).toBe("2 * 3 and my_var_name and **open");
  });
  it("never produces raw html: tags stay literal text", () => {
    const t = parseInline("<script>alert(1)</script>");
    expect(t).toEqual([{ t: "text", v: "<script>alert(1)</script>" }]);
  });
});

describe("parseMarkdown", () => {
  const md = [
    "Intro paragraph with **bold**.",
    "",
    "## Key takeaways",
    "",
    "- one",
    "- two",
    "",
    "## Steps",
    "",
    "1. first",
    "2. second",
    "",
    "> a quote",
    "",
    "## Frequently asked questions",
    "",
    "### What is it?",
    "It is a thing.",
    "",
    "### Why?",
    "Because. Really.",
  ].join("\n");

  it("builds headings with unique ids, lists, quotes and paragraphs", () => {
    const b = parseMarkdown(md);
    expect(b.map((x) => x.t)).toEqual(["p", "h", "ul", "h", "ol", "quote", "h", "h", "p", "h", "p"]);
    expect(headingsOf(b).map((h) => h.id)).toEqual(["key-takeaways", "steps", "frequently-asked-questions"]);
  });

  it("de-duplicates heading ids", () => {
    const ids = parseMarkdown("## Same\n\n## Same\n").map((b) => (b.t === "h" ? b.id : ""));
    expect(ids).toEqual(["same", "same-2"]);
  });

  it("downgrades a stray # to a section heading, never a second H1", () => {
    const b = parseMarkdown("# Title\n\ntext");
    expect(b[0]).toMatchObject({ t: "h", level: 2 });
  });

  it("extracts FAQ pairs only from the FAQ section", () => {
    expect(extractFaq(parseMarkdown(md))).toEqual([
      { question: "What is it?", answer: "It is a thing." },
      { question: "Why?", answer: "Because. Really." },
    ]);
    expect(extractFaq(parseMarkdown("## Other\n\n### Q?\nA."))).toEqual([]);
  });

  it("handles fenced code, rules and CRLF", () => {
    const b = parseMarkdown("```\n# not a heading\n```\r\n\r\n---\r\n\r\ntext");
    expect(b.map((x) => x.t)).toEqual(["code", "hr", "p"]);
  });

  it("counts words", () => {
    expect(wordCount("one two  three\nfour")).toBe(4);
    expect(wordCount("  ")).toBe(0);
  });
});
