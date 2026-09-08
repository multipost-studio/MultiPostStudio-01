import { describe, it, expect } from "vitest";
import { applyUtm } from "./utm";

/**
 * UTM fields were collected in the composer, stored on the post, and never
 * applied to anything — every "campaign" post published with untagged links.
 * These pin the rewriting, because it edits text that goes out to a real
 * audience and a mangled link is worse than an untagged one.
 */

const TAGS = { source: null, medium: "social", campaign: "summer_sale" };

describe("applyUtm", () => {
  it("tags a bare link", () => {
    const out = applyUtm("Read this: https://example.com/post", TAGS, "linkedin");
    expect(out).toContain("utm_campaign=summer_sale");
    expect(out).toContain("utm_medium=social");
  });

  it("uses the platform as the source when none was given", () => {
    // The whole reason this runs per channel rather than once on save.
    expect(applyUtm("https://example.com", TAGS, "linkedin")).toContain("utm_source=linkedin");
    expect(applyUtm("https://example.com", TAGS, "instagram")).toContain("utm_source=instagram");
  });

  it("prefers an explicit source over the platform", () => {
    const out = applyUtm("https://example.com", { ...TAGS, source: "newsletter" }, "x");
    expect(out).toContain("utm_source=newsletter");
    expect(out).not.toContain("utm_source=x");
  });

  it("returns the body untouched when there is nothing to tag", () => {
    const body = "No campaign here: https://example.com/post";
    expect(applyUtm(body, {}, "x")).toBe(body);
    expect(applyUtm(body, { source: "", medium: null, campaign: "  " }, "x")).toBe(body);
  });

  it("keeps a parameter the author wrote themselves", () => {
    const out = applyUtm("https://example.com?utm_source=podcast", TAGS, "linkedin");
    expect(out).toContain("utm_source=podcast");
    expect(out).not.toContain("utm_source=linkedin");
  });

  it("preserves existing query params and the fragment", () => {
    const out = applyUtm("https://example.com/a?ref=abc#section", TAGS, "x");
    expect(out).toContain("ref=abc");
    expect(out).toContain("#section");
  });

  it("does not swallow the punctuation after a link", () => {
    // "…example.com." must not become part of the URL.
    const out = applyUtm("Go to https://example.com/x, now.", TAGS, "x");
    expect(out).toMatch(/,\s+now\.$/);
    expect(out).not.toContain("com/x,?");
  });

  it("tags every link in the body", () => {
    const out = applyUtm("https://a.example.com and https://b.example.com", TAGS, "x");
    expect(out.match(/utm_campaign=summer_sale/g)).toHaveLength(2);
  });

  it("leaves text that only looks like a link alone", () => {
    const body = "email me at hi@example.com or see example.com";
    expect(applyUtm(body, TAGS, "x")).toBe(body);
  });

  it("handles a body with no links at all", () => {
    expect(applyUtm("Just a caption.", TAGS, "x")).toBe("Just a caption.");
  });
});
