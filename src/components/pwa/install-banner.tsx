"use client";

import * as React from "react";
import { Download, Share, X } from "lucide-react";

const DISMISSED_KEY = "mps_install_dismissed";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * True on an iPhone or iPad (including iPadOS, which calls itself a Mac) that is showing the site in a browser tab rather
 * than as an installed app. iOS has no install prompt to hook: the only way is Share, then Add to Home Screen.
 */
export function isIosBrowserTab(nav: { userAgent: string; maxTouchPoints?: number; standalone?: boolean }, standaloneMedia: boolean): boolean {
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent) || (nav.userAgent.includes("Macintosh") && (nav.maxTouchPoints ?? 0) > 1);
  return ios && !standaloneMedia && nav.standalone !== true;
}

const noopSubscribe = () => () => {};
function detectIosBrowserTab(): boolean {
  try {
    return isIosBrowserTab(navigator as unknown as { userAgent: string; maxTouchPoints?: number; standalone?: boolean }, window.matchMedia("(display-mode: standalone)").matches);
  } catch {
    return false;
  }
}

/**
 * Chrome, Edge and Android: appears when the browser fires `beforeinstallprompt` and offers a real Install button.
 * iPhone and iPad: that event never fires, so a short how-to is shown instead (Share, then Add to Home Screen) until it is
 * dismissed or the app is installed. Both stay silent inside the installed app.
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

  // Read on the client only: the server snapshot is false, so the first render matches the server and there is no
  // hydration mismatch; React re-renders with the real answer right after.
  const iosTab = React.useSyncExternalStore(noopSubscribe, detectIosBrowserTab, () => false);
  const [iosHidden, setIosHidden] = React.useState(false);

  if (!dismissed && iosTab && !iosHidden && !promptEvent) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-center justify-center gap-2 border-b border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-2 text-[13px] font-medium text-[var(--text)]"
      >
        <span className="inline-flex flex-wrap items-center justify-center gap-1.5">
          <Download size={14} aria-hidden />
          Install MultiPost Studio: tap
          <Share size={14} aria-label="Share" className="inline" />
          then &ldquo;Add to Home Screen&rdquo;.
        </span>
        <button
          type="button"
          onClick={() => {
            setIosHidden(true);
            try {
              localStorage.setItem(DISMISSED_KEY, "1");
            } catch {}
          }}
          aria-label="Dismiss install hint"
          className="rounded-[var(--radius)] p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
        >
          <X size={14} />
        </button>
      </div>
    );
  }

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
