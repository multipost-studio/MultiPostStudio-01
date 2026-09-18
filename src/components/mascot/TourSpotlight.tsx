"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useReducedMotion } from "motion/react";
import { MascotOnboarding } from "./MascotOnboarding";
import { TOUR_STEPS, placeTourCard } from "./mascot-config";

interface TargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Tracks a real UI element for the tour spotlight. Polls briefly after
 * navigation (routes render async), scrolls it into view once, then follows
 * it across scroll/resize. Returns null while unresolved — the caller falls
 * back to the companion corner instead of breaking.
 */
function useTourTarget(selector: string | undefined): TargetRect | null {
  const [rect, setRect] = React.useState<TargetRect | null>(null);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    let disposed = false;
    let pollTimer: number | null = null;
    let raf = 0;
    let tries = 0;
    let scrolled = false;

    const measure = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (!disposed) setRect({ x: r.x, y: r.y, width: r.width, height: r.height });
    };

    const scheduleMeasure = (el: Element) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => measure(el));
    };

    const onScrollOrResize = () => {
      const el = document.querySelector(selector);
      if (el) scheduleMeasure(el);
      else if (!disposed) setRect(null);
    };

    const poll = () => {
      if (disposed) return;
      const el = document.querySelector(selector);
      if (el) {
        if (!scrolled) {
          scrolled = true;
          try {
            el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
          } catch {
            // scrollIntoView unavailable — measurement still works.
          }
        }
        scheduleMeasure(el);
        window.addEventListener("scroll", onScrollOrResize, { capture: true, passive: true });
        window.addEventListener("resize", onScrollOrResize);
        // Re-measure after smooth scrolling settles.
        pollTimer = window.setTimeout(() => {
          if (!disposed) {
            const again = document.querySelector(selector);
            if (again) measure(again);
          }
        }, 600);
        return;
      }
      tries += 1;
      if (tries < 40) pollTimer = window.setTimeout(poll, 100);
    };

    setRect(null);
    poll();
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [selector, reduceMotion]);

  return rect;
}

/**
 * Coach-mark spotlight for the "Show me around" tour. Highlights the actual
 * UI element with a primary ring and docks the tour card beside it — all in
 * a body portal with `pointer-events-none`, so nothing underneath shifts,
 * blocks, or loses interactivity.
 */
export function TourSpotlight({
  step,
  onNext,
  onBack,
  onSkip,
}: {
  step: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const current = TOUR_STEPS[step] ?? TOUR_STEPS[0];
  const rect = useTourTarget(current.target);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [cardSize, setCardSize] = React.useState({ w: 320, h: 280 });

  const anchored = rect !== null;

  React.useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const update = () => setCardSize({ w: el.offsetWidth || 320, h: el.offsetHeight || 280 });
    update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    if (ro) ro.observe(el);
    return () => ro?.disconnect();
  }, [step, anchored]);

  const placement =
    typeof window === "undefined"
      ? { top: 0, left: 0 }
      : placeTourCard(
          { w: window.innerWidth, h: window.innerHeight },
          rect,
          cardSize,
        );

  const pad = 8;
  const ring = rect
    ? {
        top: Math.max(0, rect.y - pad),
        left: Math.max(0, rect.x - pad),
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  return createPortal(
    // Portal with pointer-events-none: the ring never intercepts input and
    // the card re-enables it locally, so nothing underneath shifts or blocks.
    <div className="pointer-events-none fixed inset-0 z-[var(--z-drawer)]">
      {ring && (
        <div
          aria-hidden
          className="absolute rounded-[var(--radius-lg)]"
          style={{
            top: ring.top,
            left: ring.left,
            width: ring.width,
            height: ring.height,
            boxShadow: "0 0 0 2px var(--primary), 0 8px 30px -8px var(--primary)",
            transition: reduceMotion ? undefined : "top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease",
          }}
        />
      )}
      <div
        ref={cardRef}
        className="pointer-events-auto absolute"
        style={{ top: placement.top, left: placement.left }}
      >
        <MascotOnboarding step={step} onNext={onNext} onBack={onBack} onSkip={onSkip} />
      </div>
    </div>,
    document.body,
  );
}
