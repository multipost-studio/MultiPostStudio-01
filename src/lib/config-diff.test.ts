import { describe, expect, it } from "vitest";
import { changedFields, describeChange, prettyConfig } from "./config-diff";

const j = (o: unknown) => JSON.stringify(o);

describe("changedFields", () => {
  it("lists top-level fields that differ, including added and removed ones", () => {
    expect(changedFields(j({ a: 1, b: 2, c: 3 }), j({ a: 1, b: 9, d: 4 }))).toEqual(["b", "c", "d"]);
  });
  it("compares nested values by content", () => {
    expect(changedFields(j({ links: [1, 2] }), j({ links: [1, 2] }))).toEqual([]);
    expect(changedFields(j({ links: [1, 2] }), j({ links: [1, 3] }))).toEqual(["links"]);
  });
  it("returns null when either side is not a JSON object", () => {
    expect(changedFields(null, j({ a: 1 }))).toBeNull();
    expect(changedFields("not json", j({ a: 1 }))).toBeNull();
    expect(changedFields(j([1]), j({ a: 1 }))).toBeNull();
    expect(changedFields(j({ a: 1 }), "")).toBeNull();
  });
});

describe("describeChange", () => {
  it("names the cases a person cares about", () => {
    expect(describeChange(j({ a: 1 }), "")).toBe("Reset to defaults");
    expect(describeChange(null, j({ a: 1 }))).toBe("First saved version");
    expect(describeChange(j({ a: 1 }), j({ a: 1 }))).toBe("Saved with no changes");
    expect(describeChange("garbage", j({ a: 1 }))).toBe("Replaced");
    expect(describeChange(j({ a: 1, b: 1 }), j({ a: 2, b: 2 }))).toBe("Changed a, b");
  });
  it("caps a long list of changed fields", () => {
    const a = Object.fromEntries("abcdefg".split("").map((k) => [k, 1]));
    const b = Object.fromEntries("abcdefg".split("").map((k) => [k, 2]));
    expect(describeChange(j(a), j(b))).toBe("Changed a, b, c, d and 3 more");
  });
});

describe("prettyConfig", () => {
  it("formats JSON, labels the empty cases, and caps size", () => {
    expect(prettyConfig(j({ a: 1 }))).toBe('{\n  "a": 1\n}');
    expect(prettyConfig(null)).toBe("(did not exist)");
    expect(prettyConfig("")).toBe("(defaults)");
    expect(prettyConfig("not json")).toBe("not json");
    expect(prettyConfig(j({ big: "x".repeat(100) }), 20)).toContain("more characters");
  });
});
