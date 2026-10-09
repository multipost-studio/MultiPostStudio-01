import { describe, it, expect } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(toCsv([["a,b", 'say "hi"', "line\nbreak"]])).toBe('"a,b","say ""hi""","line\nbreak"');
  });

  it("neutralises spreadsheet formulas", () => {
    expect(toCsv([["=HYPERLINK(1)", "+1", "-1", "@SUM", "ok"]])).toBe("'=HYPERLINK(1),'+1,'-1,'@SUM,ok");
  });

  it("renders null, numbers and dates", () => {
    expect(toCsv([[null, undefined, 3, new Date("2026-10-05T00:00:00Z")]])).toBe(",,3,2026-10-05T00:00:00.000Z");
  });
});
