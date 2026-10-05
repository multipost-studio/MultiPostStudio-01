/**
 * Cookie consent rules. Pure, shared by the consent endpoint, the tracking
 * endpoint and the client banner so there is exactly one definition of who may
 * be tracked and when.
 *
 * Model:
 *  - Essential cookies (sign-in, security, workspace) never need consent.
 *  - Non-essential "analytics" cookies (our first-party acquisition cookies and
 *    Google Analytics) need an explicit YES in regions that require opt-in
 *    (EEA, UK, Switzerland, India) and whenever we cannot tell where the visitor is.
 *    Elsewhere they run by default with a visible notice and an equally easy NO.
 *  - An explicit choice always wins, in every region.
 *  - Do Not Track / Global Privacy Control are honoured everywhere, regardless
 *    of any other setting.
 */

export const CONSENT_COOKIE = "mps_consent";
export const CONSENT_MAX_AGE_DAYS = 365;

export type ConsentChoice = "all" | "essential";
/** "regional": opt-in only where the law requires it. "everywhere": opt-in for every visitor. */
export type ConsentMode = "regional" | "everywhere";

const EU27 = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];
// EEA (EU + IS, LI, NO), the UK and Switzerland (GDPR / UK GDPR / FADP), plus India (DPDP Act 2023),
// which expects clear affirmative consent. India is also this product's home market and billing region.
const OPT_IN_COUNTRIES = new Set([...EU27, "IS", "LI", "NO", "GB", "CH", "IN"]);

export function consentModeFromEnv(raw: string | undefined = process.env.CONSENT_MODE): ConsentMode {
  return raw === "everywhere" ? "everywhere" : "regional";
}

export function parseConsent(raw: string | null | undefined): ConsentChoice | null {
  return raw === "all" || raw === "essential" ? raw : null;
}

/** Visitor country from the edge platform's headers (Vercel, Cloudflare). null when unknown (e.g. local dev). */
export function countryFrom(h: { get(name: string): string | null }): string | null {
  const raw = h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry");
  const c = raw?.trim().toUpperCase();
  return c && /^[A-Z]{2}$/.test(c) && c !== "XX" && c !== "T1" ? c : null;
}

/** Unknown location counts as opt-in: when we cannot prove opt-in is unnecessary, we ask. */
export function requiresOptIn(country: string | null, mode: ConsentMode = "regional"): boolean {
  if (mode === "everywhere") return true;
  if (!country) return true;
  return OPT_IN_COUNTRIES.has(country.toUpperCase());
}

export function analyticsAllowed(i: { country: string | null; choice: ConsentChoice | null; mode?: ConsentMode }): boolean {
  if (i.choice === "essential") return false;
  if (i.choice === "all") return true;
  return !requiresOptIn(i.country, i.mode ?? "regional");
}

/** Do Not Track / Global Privacy Control: a standing "no" that overrides everything. */
export function privacySignalOn(h: { get(name: string): string | null }): boolean {
  return h.get("dnt") === "1" || h.get("sec-gpc") === "1";
}

export type ConsentStatus = {
  /** Whether analytics may run right now. */
  analytics: boolean;
  /** The visitor's recorded choice, if any. */
  choice: ConsentChoice | null;
  /** Whether this visitor's region requires opt-in. */
  optIn: boolean;
  /** Whether the banner should be shown (no choice yet and no privacy signal). */
  show: boolean;
  /** True when a browser privacy signal is switching analytics off. */
  signal: boolean;
};

export function consentStatus(i: { country: string | null; choice: ConsentChoice | null; signal: boolean; mode?: ConsentMode }): ConsentStatus {
  const mode = i.mode ?? "regional";
  return {
    analytics: !i.signal && analyticsAllowed({ country: i.country, choice: i.choice, mode }),
    choice: i.choice,
    optIn: requiresOptIn(i.country, mode),
    show: !i.signal && i.choice === null,
    signal: i.signal,
  };
}
