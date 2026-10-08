"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";

/**
 * A tab left open across a deploy still runs the old JavaScript. Its server-action ids no longer
 * exist on the new server, so Next throws UnrecognizedActionError ("Server Action … was not found
 * on the server") and the click silently does nothing. That isn't a bug in any action, only a
 * stale page, and the fix is a reload. This listens for exactly that error and says so, instead of
 * leaving the person pressing a dead button.
 */
export function isStaleDeployError(reason: unknown): boolean {
  if (!reason || typeof reason !== "object") return false;
  const { name, message } = reason as { name?: unknown; message?: unknown };
  return name === "UnrecognizedActionError" || (typeof message === "string" && /Server Action .* was not found on the server/.test(message));
}

export function StaleDeployGuard() {
  const [stale, setStale] = React.useState(false);

  React.useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (isStaleDeployError(e.reason)) setStale(true);
    };
    const onError = (e: ErrorEvent) => {
      if (isStaleDeployError(e.error)) setStale(true);
    };
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    return () => {
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
    };
  }, []);

  if (!stale) return null;
  return (
    <div role="alert" className="fixed inset-x-3 bottom-4 z-[120] mx-auto flex max-w-md items-center gap-3 rounded-[16px] border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3.5 shadow-[var(--shadow-lg)] sm:bottom-6">
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-[var(--text)]">
        <strong className="block font-semibold">MultiPost Studio was just updated</strong>
        Reload this page to carry on. Anything you haven&apos;t saved on it will be lost.
      </span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-[var(--primary)] px-4 py-2 text-[14px] font-semibold text-[var(--primary-text)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]"
      >
        <RefreshCw size={14} aria-hidden /> <span>Reload</span>
      </button>
    </div>
  );
}
