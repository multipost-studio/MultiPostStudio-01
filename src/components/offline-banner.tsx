"use client";

import * as React from "react";
import { WifiOff } from "lucide-react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/**
 * True while the browser reports a network connection. Uses
 * useSyncExternalStore so the initial value is correct even if the page loads
 * while already offline. SSR snapshot assumes online.
 */
export function useOnline() {
  return React.useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Sticky, non-blocking banner shown app-wide while the connection is down.
 * The user keeps their current view and any in-progress edits; network
 * actions surface their own errors.
 */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-[70] flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium"
      style={{ background: "var(--warning-soft)", color: "var(--warning)" }}
    >
      <WifiOff size={14} aria-hidden />
      You&apos;re offline. Changes you make won&apos;t sync until you reconnect.
    </div>
  );
}
