"use client";

import * as React from "react";
import { Download, X } from "lucide-react";

const DISMISSED_KEY = "mps_install_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * Only appears when the browser actually fires `beforeinstallprompt` —
 * Chrome/Edge/Android, roughly. iOS Safari never fires it (no native install
 * prompt API there), so this renders nothing on iOS rather than showing a
 * button that can't do anything; the App Shell's own "Add to Home Screen"
 * is the real path there and needs no help from us.
 */
export function InstallBanner() {
  const [promptEvent, setPromptEvent] = React.useState<BeforeInstallPromptEvent | null>(null);
  // Lazy initializer (not an effect): localStorage is only readable client-side,
  // and reading it here — rather than defaulting true then correcting in an
  // effect — avoids a spurious extra render and matches SSR (server always
  // renders null anyway since promptEvent starts null).
  const [dismissed] = React.useState(() => {
    try {
      return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
      // Private mode / storage blocked: default to not showing rather than
      // risk re-nagging every reload with no way for the user to dismiss it.
      return true;
    }
  });

  React.useEffect(() => {
    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setPromptEvent(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  if (dismissed || !promptEvent) return null;

  function dismiss() {
    setPromptEvent(null);
    try {
      localStorage.setItem(DISMISSED_KEY, "1");
    } catch {}
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-3 border-b border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-2 text-[13px] font-medium text-[var(--text)]"
    >
      <span className="inline-flex items-center gap-1.5">
        <Download size={14} aria-hidden />
        Install MultiPost Studio for a faster, app-like experience.
      </span>
      <button
        type="button"
        onClick={async () => {
          await promptEvent.prompt();
          await promptEvent.userChoice;
          dismiss();
        }}
        className="rounded-[var(--radius-full)] bg-[var(--primary)] px-3 py-1 text-[12px] font-semibold text-[var(--primary-text)]"
      >
        Install
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="rounded-[var(--radius)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
      >
        <X size={14} />
      </button>
    </div>
  );
}
