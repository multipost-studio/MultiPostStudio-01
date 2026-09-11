import { parseJson } from "@/lib/utils";

export type ComplianceRules = {
  forbiddenWords: string[];
  disclaimerTriggers: string[];
  requiredDisclaimer: string;
};

export const EMPTY_COMPLIANCE_RULES: ComplianceRules = {
  forbiddenWords: [],
  disclaimerTriggers: [],
  requiredDisclaimer: "",
};

export function parseComplianceRules(raw: string | null): ComplianceRules {
  if (!raw) return EMPTY_COMPLIANCE_RULES;
  const parsed = parseJson<Partial<ComplianceRules>>(raw, {});
  return {
    forbiddenWords: Array.isArray(parsed.forbiddenWords) ? parsed.forbiddenWords : [],
    disclaimerTriggers: Array.isArray(parsed.disclaimerTriggers) ? parsed.disclaimerTriggers : [],
    requiredDisclaimer: typeof parsed.requiredDisclaimer === "string" ? parsed.requiredDisclaimer : "",
  };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Pre-publish compliance gate: forbidden phrases (financial promises, medical
 * claims, whatever a regulated workspace defines) block outright; a
 * disclaimer trigger without the required disclaimer text present also
 * blocks. Returns one problem string per violation, empty when clean.
 */
export function lintCompliance(body: string, rules: ComplianceRules): string[] {
  const problems: string[] = [];
  const lower = body.toLowerCase();

  for (const word of rules.forbiddenWords) {
    if (!word.trim()) continue;
    const re = new RegExp(`\\b${escapeRegex(word.trim())}\\b`, "i");
    if (re.test(body)) problems.push(`Contains forbidden phrase: "${word.trim()}"`);
  }

  const triggered = rules.disclaimerTriggers.some((t) => t.trim() && lower.includes(t.trim().toLowerCase()));
  if (triggered && rules.requiredDisclaimer.trim() && !lower.includes(rules.requiredDisclaimer.trim().toLowerCase())) {
    problems.push(`Missing required disclaimer: "${rules.requiredDisclaimer.trim()}"`);
  }

  return problems;
}
