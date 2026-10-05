"use client";

import * as React from "react";
import Link from "next/link";
import { Cookie } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ConsentStatus } from "@/lib/consent";
import { fetchConsentStatus, OPEN_CONSENT, saveConsent } from "./consent-client";

/**
 * Cookie notice with equal-weight Accept / Decline. Shown once per visitor
 * until they choose, and reopenable from any "Cookie settings" link. It does
 * not block the page and does not steal focus. Where opt-in is required the
 * copy says analytics are off until accepted; elsewhere it says they are on
 * and can be declined. Either choice is honoured everywhere on the site.
 */
export function ConsentBanner() {
  const [status, setStatus] = React.useState<ConsentStatus | null>(null);
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let alive = true;
    void fetchConsentStatus().then((s) => {
      if (!alive || !s) return;
      setStatus(s);
      if (s.show) setOpen(true);
    });
    const reopen = () => {
      void fetchConsentStatus().then((s) => {
        if (s) setStatus(s);
        setOpen(true);
      });
    };
    window.addEventListener(OPEN_CONSENT, reopen);
    return () => {
      alive = false;
      window.removeEventListener(OPEN_CONSENT, reopen);
    };
  }, []);

  if (!open) return null;

  async function choose(choice: "all" | "essential") {
    setBusy(true);
    const next = await saveConsent(choice);
    setBusy(false);
    if (next) {
      setStatus(next);
      setOpen(false);
    }
  }

  const optIn = status?.optIn ?? true;
  const signal = status?.signal ?? false;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Cookie preferences"
      className="mps-animate-in fixed inset-x-3 bottom-3 z-[var(--z-toast)] max-w-md rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-4 shadow-lg sm:inset-x-auto sm:bottom-4 sm:left-4 sm:pb-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]">
          <Cookie size={16} aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[var(--text)]">Cookies and analytics</p>
          <p className="mt-1 text-[13px] leading-snug text-[var(--text-muted)]">
            {signal
              ? "Your browser is sending a Do Not Track or Global Privacy Control signal, so analytics stay off whatever you choose here. Essential cookies for signing in always run."
              : optIn
                ? "We would like to use analytics cookies to learn which pages and campaigns bring people to MultiPost Studio. They stay off unless you accept. Essential cookies for signing in always run."
                : "We use analytics cookies to learn which pages and campaigns bring people to MultiPost Studio. You can decline and everything works the same. Essential cookies for signing in always run."}{" "}
            <Link href="/legal/cookies" className="font-medium text-[var(--primary)] hover:underline">
              Cookie policy
            </Link>
          </p>
          {status?.choice && (
            <p className="mt-1.5 text-[12px] text-[var(--text-subtle)]">Currently: analytics {status.choice === "all" ? "accepted" : "declined"}.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void choose("all")} disabled={busy || signal} className="min-w-[6.5rem]">
              Accept
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void choose("essential")} disabled={busy} className="min-w-[6.5rem]">
              Decline
            </Button>
            {status?.choice && (
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
