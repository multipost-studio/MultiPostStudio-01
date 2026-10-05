"use client";

import * as React from "react";
import Script from "next/script";
import { CONSENT_CHANGED, fetchConsentStatus, setGaDisabled } from "./consent-client";

type GaWindow = Window & { __mpsGaId?: string };

/**
 * Loads Google Analytics only when the visitor's consent status allows it:
 * after Accept where opt-in is required, by default (with the notice) elsewhere,
 * and never with a Do Not Track / Global Privacy Control signal or after
 * Decline. Reacts to a choice made on this page without a reload. Replaces the
 * previous unconditional <Script> tags in the root layout.
 */
export function GoogleAnalytics({ id }: { id: string }) {
  const [enabled, setEnabled] = React.useState(false);

  React.useEffect(() => {
    (window as GaWindow).__mpsGaId = id;
    let alive = true;
    void fetchConsentStatus().then((s) => {
      if (alive) setEnabled(!!s?.analytics);
    });
    const onChange = (e: Event) => {
      const allowed = !!(e as CustomEvent<{ analytics: boolean }>).detail?.analytics;
      setGaDisabled(!allowed);
      setEnabled(allowed);
    };
    window.addEventListener(CONSENT_CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CONSENT_CHANGED, onChange);
    };
  }, [id]);

  if (!enabled) return null;
  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" />
      <Script id="ga-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${id}');`}
      </Script>
    </>
  );
}
