"use client";

import type { ConsentChoice, ConsentStatus } from "@/lib/consent";

/** Fired on window after the visitor chooses. detail: { analytics: boolean }. */
export const CONSENT_CHANGED = "mps-consent-changed";
/** Fire on window to reopen the cookie banner ("Cookie settings" links). */
export const OPEN_CONSENT = "mps-open-consent";

type GaWindow = Window & { __mpsGaId?: string } & Record<string, unknown>;

let cached: Promise<ConsentStatus | null> | null = null;

/** One status request per page load, shared by the banner and the Google Analytics loader. */
export function fetchConsentStatus(): Promise<ConsentStatus | null> {
  cached ??= fetch("/api/consent", { cache: "no-store", credentials: "same-origin" })
    .then((r) => (r.ok ? (r.json() as Promise<ConsentStatus>) : null))
    .catch(() => null);
  return cached;
}

/** Google Analytics' `_ga*` cookies are set by its script on this site, so we can and should remove them when consent is withdrawn. */
export function clearAnalyticsCookies(): void {
  const host = window.location.hostname;
  const parts = host.split(".");
  const domains = new Set<string | undefined>([undefined, host, `.${host}`]);
  if (parts.length > 2) domains.add(`.${parts.slice(-2).join(".")}`);
  for (const pair of document.cookie.split(";")) {
    const name = pair.split("=")[0]?.trim();
    if (!name || !name.startsWith("_ga")) continue;
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
  }
}

/** GA's documented opt-out switch; stops hits from a script that is already loaded. */
export function setGaDisabled(disabled: boolean): void {
  const w = window as unknown as GaWindow;
  if (w.__mpsGaId) w[`ga-disable-${w.__mpsGaId}`] = disabled;
}

/** Persist the choice, apply it on this page straight away, and tell the other loaders. */
export async function saveConsent(choice: ConsentChoice): Promise<ConsentStatus | null> {
  let status: ConsentStatus | null = null;
  try {
    const res = await fetch("/api/consent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ choice }),
    });
    if (res.ok) status = (await res.json()) as ConsentStatus;
  } catch {
    /* offline: fall through, the choice just isn't saved */
  }
  if (!status) return null;
  cached = Promise.resolve(status);
  if (!status.analytics) {
    setGaDisabled(true);
    clearAnalyticsCookies();
  } else {
    setGaDisabled(false);
  }
  window.dispatchEvent(new CustomEvent(CONSENT_CHANGED, { detail: { analytics: status.analytics } }));
  return status;
}
