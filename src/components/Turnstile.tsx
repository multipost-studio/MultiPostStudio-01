"use client";

import * as React from "react";

/**
 * Cloudflare Turnstile widget (renders only when a site key is configured).
 * Fail-open by design: unconfigured deployments get no widget and server
 * verification skips (see lib/bot-protection.ts), so existing flows keep
 * working with zero config. When configured, the token posts as
 * `cf-turnstile-response` alongside the form.
 *
 * A widget that can't start (blocked script, a site key that isn't valid for this domain, a challenge that hangs) used to
 * throw an uncaught "TurnstileError" in the visitor's browser. It now reports it handled and says so on the page, so the
 * person knows to reload instead of staring at a form that won't submit.
 */
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost)$/;

export function Turnstile() {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = React.useRef<HTMLDivElement>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!siteKey || !ref.current) return;
    // The site key is registered for the real domain. On localhost Cloudflare answers with an "invalid domain" error every
    // time, so a local dev server shows no widget instead of a broken one.
    if (LOCAL_HOST.test(window.location.hostname)) return;
    const renderWidget = () => {
      const w = window as unknown as { turnstile?: { render: (el: HTMLElement, opts: object) => void } };
      if (w.turnstile && ref.current && !ref.current.dataset.done) {
        ref.current.dataset.done = "1";
        w.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: () => setFailed(false),
          // Returning true tells Turnstile the error is handled (it would otherwise throw it into the page).
          "error-callback": () => {
            setFailed(true);
            return true;
          },
          "timeout-callback": () => setFailed(true),
        });
      }
    };
    const s = document.querySelector('script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (!s) {
      const el = document.createElement("script");
      el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      el.async = true;
      el.defer = true;
      el.onload = renderWidget;
      el.onerror = () => setFailed(true);
      document.head.appendChild(el);
    } else {
      renderWidget();
    }
  }, [siteKey]);

  if (!siteKey) return null;
  return (
    <>
      <div ref={ref} className="cf-turnstile" />
      {failed && (
        <p role="status" className="text-[12.5px] text-[var(--text-muted)]">
          The security check couldn&apos;t load. Reload the page. If it keeps failing, turn off any extension that blocks challenges.cloudflare.com.
        </p>
      )}
    </>
  );
}
