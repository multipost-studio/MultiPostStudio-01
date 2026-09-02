import { describe, it, expect } from "vitest";
import {
  hashString,
  hueFromString,
  photoUrl,
  seededRandom,
  slugify,
  clamp,
  parseJson,
  initials,
  formatCurrency,
} from "./utils";

describe("hashString", () => {
  it("is deterministic and non-negative", () => {
    expect(hashString("cadence")).toBe(hashString("cadence"));
    expect(hashString("cadence")).toBeGreaterThanOrEqual(0);
  });
  it("differs for different inputs", () => {
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("hueFromString", () => {
  it("stays within the 0–15 red band", () => {
    for (const s of ["alice", "bob", "carol", "", "a-very-long-workspace-name"]) {
      const h = hueFromString(s);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(16);
    }
  });
});

describe("photoUrl", () => {
  it("is deterministic and points at randomuser.me", () => {
    const a = photoUrl("Jordan");
    expect(a).toBe(photoUrl("Jordan"));
    expect(a).toMatch(/^https:\/\/randomuser\.me\/api\/portraits\/(women|men)\/\d{1,2}\.jpg$/);
  });
});

describe("seededRandom", () => {
  it("is deterministic and in [0,1)", () => {
    const v = seededRandom("seed-1");
    expect(v).toBe(seededRandom("seed-1"));
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  });
});

describe("slugify", () => {
  it("lowercases and dashes non-alphanumerics", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("Acme Inc. — 2026")).toBe("acme-inc-2026");
  });
});

describe("clamp", () => {
  it("bounds the value", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe("parseJson", () => {
  it("parses valid json", () => {
    expect(parseJson('{"a":1}', {})).toEqual({ a: 1 });
  });
  it("returns the fallback on null/invalid", () => {
    expect(parseJson(null, "fb")).toBe("fb");
    expect(parseJson("not json", [])).toEqual([]);
  });
});

describe("initials", () => {
  it("takes first letters, max two", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Prince")).toBe("P");
  });
});

describe("formatCurrency", () => {
  it("formats cents as dollars", () => {
    expect(formatCurrency(1999)).toBe("$19.99");
  });
});
