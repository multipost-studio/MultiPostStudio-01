import { describe, expect, it } from "vitest";
import { VERSION_RE, inForce, isPolicyType, isUpcoming, policyTypeLabel, safePolicyUrl } from "./policy-versions";

const NOW = new Date("2026-10-09T12:00:00Z");
const v = (type: string, version: string, day: string) => ({ type, version, effectiveAt: new Date(`${day}T00:00:00Z`) });

describe("safePolicyUrl", () => {
  it("allows a path on this site or an https URL", () => {
    expect(safePolicyUrl("/legal/terms")).toBe("/legal/terms");
    expect(safePolicyUrl("  /privacy ")).toBe("/privacy");
    expect(safePolicyUrl("https://example.com/terms")).toBe("https://example.com/terms");
  });
  it("refuses anything that could run script, leave the site silently, or is not a link", () => {
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "http://example.com", "//evil.example/x", "/a b", "/a\\b", "ftp://x", "terms", "", null, undefined, 5, "https://" + "a".repeat(400) + ".com"]) {
      expect(safePolicyUrl(bad)).toBeNull();
    }
  });
});

describe("versions", () => {
  it("validates version labels", () => {
    for (const ok of ["1", "1.2", "2026-10", "v3.1.4", "2026.10.09-b"]) expect(VERSION_RE.test(ok)).toBe(true);
    for (const bad of ["", " 1", "1 2", ".1", "a".repeat(21), "1/2", "<b>"]) expect(VERSION_RE.test(bad)).toBe(false);
  });

  it("the version in force is the latest one that has taken effect", () => {
    const rows = [v("terms", "1", "2025-01-01"), v("terms", "2", "2026-06-01"), v("terms", "3", "2027-01-01"), v("privacy", "1", "2025-03-01")];
    expect(inForce(rows, "terms", NOW)?.version).toBe("2");
    expect(inForce(rows, "privacy", NOW)?.version).toBe("1");
    expect(inForce(rows, "dpa", NOW)).toBeNull();
    expect(isUpcoming(rows[2], NOW)).toBe(true);
    expect(isUpcoming(rows[1], NOW)).toBe(false);
  });

  it("only upcoming versions means nothing is in force yet", () => {
    expect(inForce([v("terms", "1", "2027-01-01")], "terms", NOW)).toBeNull();
  });

  it("knows its types", () => {
    expect(isPolicyType("privacy")).toBe(true);
    expect(isPolicyType("tos")).toBe(false);
    expect(policyTypeLabel("dpa")).toBe("Data processing agreement");
    expect(policyTypeLabel("zzz")).toBe("zzz");
  });
});
