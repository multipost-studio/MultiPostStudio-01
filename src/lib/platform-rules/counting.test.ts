import { describe, expect, it } from "vitest";
import { countBy, countBytes, countThreads, countCharacters, countGraphemes, countUtf16Units, countXWeighted } from "./counting";

describe("counting", () => {
  it("counts graphemes, not UTF-16 units, for emoji sequences", () => {
    const family = "👨‍👩‍👧‍👦"; // ZWJ sequence: 1 grapheme, 7 code points, 11 UTF-16 units
    expect(countGraphemes(family)).toBe(1);
    expect(countCharacters(family)).toBe(7);
    expect(countUtf16Units(family)).toBe(11);
    expect(countGraphemes("🇮🇳")).toBe(1); // flag = 2 code points
    expect(countGraphemes("é")).toBe(1); // combining accent
    expect(countGraphemes("héllo")).toBe(5);
    expect(countGraphemes("你好世界")).toBe(4);
  });

  it("counts bytes in UTF-8", () => {
    expect(countBytes("abc")).toBe(3);
    expect(countBytes("é")).toBe(2);
    expect(countBytes("你")).toBe(3);
    expect(countBytes("😀")).toBe(4);
  });

  it("weights X text: urls are 23, CJK and emoji are 2", () => {
    expect(countXWeighted("hello")).toBe(5);
    expect(countXWeighted("see https://example.com/a/very/long/path?x=1 now")).toBe(4 + 23 + 4);
    expect(countXWeighted("你好")).toBe(4);
    expect(countXWeighted("😀")).toBe(2);
  });

  it("counts Threads emoji by UTF-8 bytes", () => {
    expect(countThreads("hello")).toBe(5);
    expect(countThreads("😀")).toBe(4);
    expect(countThreads("a😀b")).toBe(6);
    expect(countThreads("é")).toBe(1);
  });

  it("dispatches by method", () => {
    expect(countBy("graphemes", "👨‍👩‍👧‍👦")).toBe(1);
    expect(countBy("utf16", "😀")).toBe(2);
    expect(countBy("characters", "😀")).toBe(1);
  });

  it("handles the empty string", () => {
    for (const m of ["characters", "graphemes", "bytes", "utf16", "x_weighted", "threads"] as const) expect(countBy(m, "")).toBe(0);
  });
});
