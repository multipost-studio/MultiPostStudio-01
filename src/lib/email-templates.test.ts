import { describe, expect, it } from "vitest";
import { BODY_MAX, SAMPLE_VARS, SUBJECT_MAX, TEMPLATES, isTemplateKey, placeholdersIn, render, safeSubject, templateDef, validateTemplate } from "./email-templates";

describe("built-in templates", () => {
  it("are themselves valid, and use only their own placeholders", () => {
    for (const t of TEMPLATES) expect(validateTemplate(t.key, t.defaultSubject, t.defaultBody), t.key).toEqual([]);
  });
  it("every template requires the link placeholder", () => {
    for (const t of TEMPLATES) expect(t.placeholders.find((p) => p.name === "link")?.required, t.key).toBe(true);
  });
  it("keys are unique and recognised", () => {
    expect(new Set(TEMPLATES.map((t) => t.key)).size).toBe(TEMPLATES.length);
    expect(isTemplateKey("verify")).toBe(true);
    expect(isTemplateKey("welcome")).toBe(false);
    expect(templateDef("reset")?.label).toBe("Reset your password");
  });
});

describe("validateTemplate", () => {
  it("accepts a good version", () => {
    expect(validateTemplate("verify", "Welcome, {name}", "Confirm here: {link}")).toEqual([]);
  });
  it("requires the link in the body", () => {
    expect(validateTemplate("reset", "Reset", "Hello, no link here")).toEqual([expect.stringMatching(/must include \{link\}/)]);
    expect(validateTemplate("reset", "Reset {link}", "Hello")).toEqual([expect.stringMatching(/must include \{link\}/)]);
  });
  it("rejects placeholders the template does not offer, so a typo cannot reach a customer", () => {
    const e = validateTemplate("verify", "Hi {nmae}", "Go {link} {org}");
    expect(e.join(" ")).toMatch(/Unknown placeholders: \{nmae\}, \{org\}/);
  });
  it("rejects empty text, multi-line subjects and oversized text", () => {
    expect(validateTemplate("verify", "", "{link}").length).toBeGreaterThan(0);
    expect(validateTemplate("verify", "Hi", "   ").length).toBeGreaterThan(0);
    expect(validateTemplate("verify", "Line one\nBcc: evil@example.com", "{link}")).toEqual([expect.stringMatching(/single line/)]);
    expect(validateTemplate("verify", "x".repeat(SUBJECT_MAX + 1), "{link}")).toEqual([expect.stringMatching(/subject can be up to/)]);
    expect(validateTemplate("verify", "ok", "{link}" + "x".repeat(BODY_MAX))).toEqual([expect.stringMatching(/body can be up to/)]);
  });
  it("rejects non-text input and unknown keys", () => {
    expect(validateTemplate("verify", 5, {})).toEqual(["Subject and body are required"]);
    expect(validateTemplate("nope", "a", "{link}")).toEqual(["Unknown template"]);
  });
});

describe("render", () => {
  it("replaces known placeholders everywhere they appear", () => {
    expect(render("Hi {name}! {name}, go {link}", { name: "Sam", link: "https://x.test" })).toBe("Hi Sam! Sam, go https://x.test");
  });
  it("leaves unknown braces alone and does not expand values again", () => {
    expect(render("{unknown} {name}", { name: "{link}", link: "L" })).toBe("{unknown} {link}");
  });
  it("an absent value becomes empty, not the word undefined", () => {
    expect(render("a{link}b", { link: undefined })).toBe("ab");
  });
  it("renders every built-in template fully with the sample values", () => {
    for (const t of TEMPLATES) {
      expect(render(t.defaultBody, SAMPLE_VARS), t.key).not.toMatch(/\{\w+\}/);
      expect(render(t.defaultSubject, SAMPLE_VARS), t.key).not.toMatch(/\{\w+\}/);
    }
  });
});

describe("helpers", () => {
  it("lists distinct placeholders", () => {
    expect(placeholdersIn("{a} {b} {a} {1x} {}")).toEqual(["a", "b"]);
  });
  it("makes a rendered subject safe for a header", () => {
    expect(safeSubject("Hi\r\nBcc: x")).toBe("Hi Bcc: x");
    expect(safeSubject("x".repeat(500)).length).toBe(SUBJECT_MAX);
  });
});
