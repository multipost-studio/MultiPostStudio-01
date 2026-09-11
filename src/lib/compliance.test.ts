import { describe, it, expect } from "vitest";
import { lintCompliance, parseComplianceRules, EMPTY_COMPLIANCE_RULES } from "./compliance";

describe("parseComplianceRules", () => {
  it("returns empty rules for null", () => {
    expect(parseComplianceRules(null)).toEqual(EMPTY_COMPLIANCE_RULES);
  });

  it("parses stored JSON", () => {
    const raw = JSON.stringify({ forbiddenWords: ["guaranteed"], disclaimerTriggers: ["invest"], requiredDisclaimer: "Not advice." });
    expect(parseComplianceRules(raw)).toEqual({
      forbiddenWords: ["guaranteed"],
      disclaimerTriggers: ["invest"],
      requiredDisclaimer: "Not advice.",
    });
  });
});

describe("lintCompliance", () => {
  it("blocks a forbidden phrase, case-insensitively", () => {
    const problems = lintCompliance("This is a GUARANTEED return.", {
      forbiddenWords: ["guaranteed return"],
      disclaimerTriggers: [],
      requiredDisclaimer: "",
    });
    expect(problems).toHaveLength(1);
  });

  it("does not false-positive on a substring that isn't a whole word/phrase match", () => {
    const problems = lintCompliance("Guaranteedly is not a real word but this isn't the phrase.", {
      forbiddenWords: ["guaranteed return"],
      disclaimerTriggers: [],
      requiredDisclaimer: "",
    });
    expect(problems).toHaveLength(0);
  });

  it("requires the disclaimer only when a trigger phrase is present", () => {
    const rules = { forbiddenWords: [], disclaimerTriggers: ["investment"], requiredDisclaimer: "Not financial advice." };
    expect(lintCompliance("Just a regular post about our product.", rules)).toHaveLength(0);
    expect(lintCompliance("Check out this investment opportunity!", rules)).toHaveLength(1);
    expect(lintCompliance("Check out this investment opportunity! Not financial advice.", rules)).toHaveLength(0);
  });

  it("is a no-op with empty rules", () => {
    expect(lintCompliance("guaranteed returns on your investment", EMPTY_COMPLIANCE_RULES)).toHaveLength(0);
  });
});
