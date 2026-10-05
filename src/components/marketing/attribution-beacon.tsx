"use client";

import * as React from "react";
import { CONSENT_CHANGED } from "@/components/consent/consent-client";

const KEY = "mps-attr";
const LANDING_KEY = "mps-attr-landing";
const SESSION_MS = 30 * 60_000;
const MARKETING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid", "msclkid", "ttclid", "ref"];

/**
 * Tells the first-party tracker how this visitor arrived (the server only
 * records it when cookie consent allows). Sends once per session, plus again whenever the URL carries a different set of marketing
 * parameters (so a campaign click mid-session is not lost). Renders nothing;
 * skipped entirely when the browser sends Do Not Track or Global Privacy
 * Control (the server checks too).
 */
export function AttributionBeacon() {
  React.useEffect(() => {
    const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
    const privacySignal = () => nav.doNotTrack === "1" || !!nav.globalPrivacyControl;

    const send = (force: boolean) => {
      try {
        if (privacySignal()) return;

        const params = new URLSearchParams(window.location.search);
        const signature = MARKETING_PARAMS.map((k) => `${k}=${params.get(k) ?? ""}`).join("&");
        const hasSignal = MARKETING_PARAMS.some((k) => params.get(k));

        const prev = JSON.parse(window.sessionStorage.getItem(KEY) ?? "null") as { at: number; sig: string } | null;
        const fresh = !!prev && Date.now() - prev.at < SESSION_MS;
        if (!force && fresh && (prev.sig === signature || !hasSignal)) return;

        window.sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), sig: signature }));

        // Remember how the session started. If consent arrives a few pages later, the
        // visit we report is the one that actually carried the campaign, not the page
        // the visitor happens to be on when they click Accept.
        const current = { landing: window.location.pathname + window.location.search, referrer: document.referrer || null };
        let payload = current;
        if (force) {
          payload = (JSON.parse(window.sessionStorage.getItem(LANDING_KEY) ?? "null") as typeof current | null) ?? current;
        } else if (!window.sessionStorage.getItem(LANDING_KEY) || hasSignal) {
          window.sessionStorage.setItem(LANDING_KEY, JSON.stringify(current));
        }

        void fetch("/api/track/visit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          credentials: "same-origin",
        }).catch(() => {});
      } catch {
        /* storage or network blocked: tracking is best-effort */
      }
    };

    send(false);

    // Where consent is required the server ignores the first beacon. If the
    // visitor accepts on this very page, send again so the landing visit (and
    // its UTM tags) is not lost.
    const onConsent = (e: Event) => {
      if ((e as CustomEvent<{ analytics: boolean }>).detail?.analytics) send(true);
    };
    window.addEventListener(CONSENT_CHANGED, onConsent);
    return () => window.removeEventListener(CONSENT_CHANGED, onConsent);
  }, []);

  return null;
}
