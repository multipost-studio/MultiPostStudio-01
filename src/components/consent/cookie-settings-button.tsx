"use client";

import { OPEN_CONSENT } from "./consent-client";

/** Reopens the cookie banner so a visitor can change or withdraw their choice at any time. */
export function CookieSettingsButton({ className, children = "Cookie settings" }: { className?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT))} className={className}>
      {children}
    </button>
  );
}
