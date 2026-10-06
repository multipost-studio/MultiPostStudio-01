import { describe, it, expect } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("parseCsv", () => {
  it("parses plain rows with LF and CRLF endings and skips blank lines", () => {
    expect(parseCsv("a,b,c\n1,2,3\r\n\r\n4,5,6\n")).toEqual([["a", "b", "c"], ["1", "2", "3"], ["4", "5", "6"]]);
  });

  it("handles quotes, doubled quotes, commas and newlines inside a field", () => {
    expect(parseCsv('"a,b","say ""hi""","line\nbreak",plain')).toEqual([["a,b", 'say "hi"', "line\nbreak", "plain"]]);
  });

  it("keeps empty fields and a trailing empty field", () => {
    expect(parseCsv("a,,c,\n,,")).toEqual([["a", "", "c", ""], ["", "", ""]]);
  });

  it("strips a UTF-8 BOM", () => {
    expect(parseCsv("﻿key,value\nx,1")).toEqual([["key", "value"], ["x", "1"]]);
  });

  it("round-trips anything toCsv can write, including the formula guard", () => {
    const rows = [["key", "description", "n"], ["=SUM(A1)", 'He said "no", then left', "+5"], ["multi\nline", "", "-1"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows.map((r) => r.map(String)));
  });

  it("returns nothing for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv("\n\n")).toEqual([]);
  });
});
