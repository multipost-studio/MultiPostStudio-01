"use client";

import * as React from "react";

/**
 * Cloudflare Turnstile widget (renders only when a site key is configured).
 * Fail-open by design: unconfigured deployments get no widget and server
 * verification skips (see lib/bot-protection.ts), so existing flows keep
 * working with zero config. When configured, the token posts as
 * `cf-turnstile-response` alongside the form.
 */
export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!siteKey || !ref.current) return;
    const renderWidget = () => {
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, opts: object) => void } };
      if (w.turnstile && ref.current && !ref.current.dataset.done) {
        ref.current.dataset.done = "1";
        w.turnstile.render(ref.current, { sitekey: siteKey });
      }
    };
    const s = document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (!s) {
      const el = document.createElement("script");
      el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      el.async = true;
      el.defer = true;
      el.onload = renderWidget;
      document.head.appendChild(el);
    } else {
      renderWidget();
    }
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="cf-turnstile" />;
}
