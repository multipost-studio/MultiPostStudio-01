import { describe, it, expect } from "vitest";
import { analyticsAllowed, consentModeFromEnv, consentStatus, countryFrom, parseConsent, privacySignalOn, requiresOptIn } from "./consent";

const h = (o: Record<string, string>) => ({ get: (k: string) => o[k.toLowerCase()] ?? null });

describe("requiresOptIn", () => {
  it("requires opt-in across the EEA, UK, Switzerland and India", () => {
    for (const c of ["DE", "FR", "IE", "SE", "IS", "NO", "LI", "GB", "CH", "IN", "gb"]) expect(requiresOptIn(c), c).toBe(true);
  });

  it("does not require it for regions where a notice is enough", () => {
    for (const c of ["US", "BR", "AU", "SG", "AE"]) expect(requiresOptIn(c), c).toBe(false);
  });

  it("treats an unknown location as opt-in", () => {
    expect(requiresOptIn(null)).toBe(true);
  });

  it("'everywhere' mode requires it for everyone", () => {
    expect(requiresOptIn("US", "everywhere")).toBe(true);
    expect(consentModeFromEnv("everywhere")).toBe("everywhere");
    expect(consentModeFromEnv("anything else")).toBe("regional");
    expect(consentModeFromEnv(undefined)).toBe("regional");
  });
});

describe("analyticsAllowed", () => {
  it("an explicit choice wins in every region", () => {
    expect(analyticsAllowed({ country: "DE", choice: "all" })).toBe(true);
    expect(analyticsAllowed({ country: "US", choice: "essential" })).toBe(false);
  });

  it("without a choice: off where opt-in is required, on elsewhere", () => {
    expect(analyticsAllowed({ country: "DE", choice: null })).toBe(false);
    expect(analyticsAllowed({ country: null, choice: null })).toBe(false);
    expect(analyticsAllowed({ country: "IN", choice: null })).toBe(false);
    expect(analyticsAllowed({ country: "US", choice: null })).toBe(true);
    expect(analyticsAllowed({ country: "US", choice: null, mode: "everywhere" })).toBe(false);
  });
});

describe("parsing", () => {
  it("only accepts known consent values", () => {
    expect(parseConsent("all")).toBe("all");
    expect(parseConsent("essential")).toBe("essential");
    for (const bad of ["yes", "ALL", "", null, undefined, "all; Path=/"]) expect(parseConsent(bad as never)).toBeNull();
  });

  it("reads the country from edge headers and ignores junk", () => {
    expect(countryFrom(h({ "x-vercel-ip-country": "in" }))).toBe("IN");
    expect(countryFrom(h({ "cf-ipcountry": "DE" }))).toBe("DE");
    for (const bad of ["XX", "T1", "USA", "", "1"]) expect(countryFrom(h({ "x-vercel-ip-country": bad }))).toBeNull();
    expect(countryFrom(h({}))).toBeNull();
  });

  it("detects DNT and GPC", () => {
    expect(privacySignalOn(h({ dnt: "1" }))).toBe(true);
    expect(privacySignalOn(h({ "sec-gpc": "1" }))).toBe(true);
    expect(privacySignalOn(h({}))).toBe(false);
  });
});

describe("consentStatus", () => {
  it("shows the banner until a choice is made, in every region", () => {
    expect(consentStatus({ country: "DE", choice: null, signal: false })).toMatchObject({ show: true, analytics: false, optIn: true });
    expect(consentStatus({ country: "US", choice: null, signal: false })).toMatchObject({ show: true, analytics: true, optIn: false });
    expect(consentStatus({ country: "US", choice: "essential", signal: false })).toMatchObject({ show: false, analytics: false });
    expect(consentStatus({ country: "DE", choice: "all", signal: false })).toMatchObject({ show: false, analytics: true });
  });

  it("a browser privacy signal turns analytics off and suppresses the banner, even after Accept", () => {
    expect(consentStatus({ country: "US", choice: null, signal: true })).toMatchObject({ analytics: false, show: false, signal: true });
    expect(consentStatus({ country: "DE", choice: "all", signal: true }).analytics).toBe(false);
  });
});
