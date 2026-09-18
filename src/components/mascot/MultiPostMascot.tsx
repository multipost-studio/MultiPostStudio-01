"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { MASCOT_DIRECTIONS, MASCOT_LABEL, MASCOT_REACTIONS } from "./mascot-config";

/**
 * Lazy client-only wrapper around `page-mascot`.
 *
 * - `ssr: false`: the sprite never participates in SSR, so there is no
 *   hydration mismatch risk (`window`/`matchMedia` are effect-only anyway).
 * - The chunk is separate from the app shell; if it ever fails to load,
 *   the skeleton stays and the rest of the app is unaffected.
 * - Clicking bubbles up from the mascot's own button (which plays its
 *   built-in boop sequence) to `onActivate`, so one tap both delights
 *   and opens the assistant — no nested buttons, no extra listeners.
 */
const Mascot = dynamic(() => import("page-mascot").then((m) => m.Mascot), {
  ssr: false,
  loading: () => (
    <span
      aria-hidden
      className="block h-full w-full animate-pulse rounded-full bg-[var(--surface-hover)]"
    />
  ),
});

/** Responsive companion size: 64px mobile · 80px tablet · 96px desktop. */
function useMascotSize(): number {
  const [size, setSize] = React.useState(96);
  React.useEffect(() => {
    const sm = window.matchMedia("(min-width: 640px)");
    const lg = window.matchMedia("(min-width: 1024px)");
    const update = () => setSize(lg.matches ? 96 : sm.matches ? 80 : 64);
    update();
    sm.addEventListener("change", update);
    lg.addEventListener("change", update);
    return () => {
      sm.removeEventListener("change", update);
      lg.removeEventListener("change", update);
    };
  }, []);
  return size;
}

export function MultiPostMascot({ onActivate }: { onActivate: () => void }) {
  const size = useMascotSize();

  // Warm the sprite sheets shortly after mount so the companion pops in
  // fully rendered instead of flashing blank. Idle-delayed, tiny, guarded.
  React.useEffect(() => {
    const warm = (src: string) => {
      try {
        const img = new Image();
        img.decoding = "async";
        img.src = src;
      } catch {
        // Asset unavailable — the companion degrades to its skeleton
        // and the app keeps working.
      }
    };
    const t = window.setTimeout(() => {
      warm(MASCOT_DIRECTIONS);
      warm(MASCOT_REACTIONS);
    }, 1500);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <div onClick={onActivate} style={{ width: size, height: size }} className="pointer-events-auto">
      <Mascot
        directions={MASCOT_DIRECTIONS}
        reactions={MASCOT_REACTIONS}
        size={size}
        label={MASCOT_LABEL}
      />
    </div>
  );
}
