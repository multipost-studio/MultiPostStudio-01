import { describe, it, expect } from "vitest";
import {
  REPORT_WIDGETS_METADATA,
  getDefaultReportConfig,
  validateReportConfig,
} from "./report-builder";

describe("Report Builder Module", () => {
  it("provides comprehensive metadata for report widgets", () => {
    expect(REPORT_WIDGETS_METADATA.length).toBeGreaterThanOrEqual(8);
    const summaryWidget = REPORT_WIDGETS_METADATA.find((w) => w.key === "executive_summary");
    expect(summaryWidget).toBeDefined();
    expect(summaryWidget?.category).toBe("narrative");
  });

  it("generates sane default report configuration", () => {
    const config = getDefaultReportConfig();
    expect(config.dateRange).toBe("last_30_days");
    expect(config.layout).toBe("grid");
    expect(config.widgets.length).toBeGreaterThan(0);
    expect(config.widgets).toContain("followers_growth");
  });

  it("validates and sanitizes custom configurations", () => {
    const valid = validateReportConfig({
      dateRange: "last_90_days",
      widgets: ["followers_growth", "top_posts"],
      layout: "single",
      executiveSummary: "Q3 Agency Client Performance Report",
      branding: {
        logo: true,
        agencyName: "Nexus Digital",
        primaryColor: "#ff0077",
      },
    });

    expect(valid.valid).toBe(true);
    expect(valid.sanitized.dateRange).toBe("last_90_days");
    expect(valid.sanitized.widgets).toEqual(["followers_growth", "top_posts"]);
    expect(valid.sanitized.layout).toBe("single");
    expect(valid.sanitized.branding?.agencyName).toBe("Nexus Digital");
    expect(valid.sanitized.branding?.primaryColor).toBe("#ff0077");
  });

  it("rejects configs with empty or invalid widget selections", () => {
    const result = validateReportConfig({
      widgets: ["non_existent_widget"],
    });

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
