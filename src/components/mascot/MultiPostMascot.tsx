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

export function MultiPostMascot({
  onActivate,
  pulse,
}: {
  onActivate: () => void;
  /**
   * One-shot mood pulse, played via the Web Animations API over the ambient
   * CSS float — no remount, no class cleanup. Skipped under
   * prefers-reduced-motion. joy/oops: success/error toast feedback. wave:
   * greeting when the assistant opens. celebrate: tour completion / milestones.
   */
  pulse?: { kind: "joy" | "oops" | "wave" | "celebrate"; at: number } | null;
}) {
  const size = useMascotSize();
  const boxRef = React.useRef<HTMLDivElement>(null);

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

  React.useEffect(() => {
    if (!pulse) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = boxRef.current;
    if (!el) return;
    if (pulse.kind === "joy") {
      el.animate(
        [{ transform: "scale(1)" }, { transform: "scale(1.18) rotate(-4deg)", offset: 0.4 }, { transform: "scale(1)" }],
        { duration: 600, easing: "ease-out" },
      );
    } else if (pulse.kind === "oops") {
      el.animate(
        [
          { transform: "translateX(0)" },
          { transform: "translateX(-5px)", offset: 0.25 },
          { transform: "translateX(5px)", offset: 0.5 },
          { transform: "translateX(-3px)", offset: 0.75 },
          { transform: "translateX(0)" },
        ],
        { duration: 450, easing: "ease-out" },
      );
    } else if (pulse.kind === "wave") {
      el.animate(
        [
          { transform: "rotate(0deg)" },
          { transform: "rotate(-10deg)", offset: 0.25 },
          { transform: "rotate(8deg)", offset: 0.5 },
          { transform: "rotate(-5deg)", offset: 0.75 },
          { transform: "rotate(0deg)" },
        ],
        { duration: 500, easing: "ease-in-out" },
      );
    } else {
      // celebrate — double hop with a bigger spin for tour completion / milestones.
      el.animate(
        [
          { transform: "scale(1) translateY(0) rotate(0deg)" },
          { transform: "scale(1.15) translateY(-10px) rotate(8deg)", offset: 0.25 },
          { transform: "scale(1) translateY(0) rotate(-6deg)", offset: 0.5 },
          { transform: "scale(1.15) translateY(-10px) rotate(6deg)", offset: 0.75 },
          { transform: "scale(1) translateY(0) rotate(0deg)" },
        ],
        { duration: 800, easing: "ease-out" },
      );
    }
  }, [pulse]);

  return (
    <div
      ref={boxRef}
      onClick={onActivate}
      style={{ width: size, height: size }}
      className="pointer-events-auto mps-mascot-float cursor-pointer transition-transform duration-200 ease-out hover:scale-110 active:scale-95"
    >
      <Mascot
        directions={MASCOT_DIRECTIONS}
        reactions={MASCOT_REACTIONS}
        size={size}
        label={MASCOT_LABEL}
      />
    </div>
  );
}
