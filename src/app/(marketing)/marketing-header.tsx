"use client";

import * as React from "react";

/**
 * The landing-page header frame. At the top of the page it is a flat, transparent
 * bar; once you scroll it lifts into a floating, blurred pill with a soft shadow,
 * the same rounded-pill language as the signed-in app's top bar. All contents are
 * passed in (and stay server-rendered); this only owns the scroll state and frame.
 * Without JavaScript it simply stays the flat bar.
 *
 * "Scrolled" is detected with a 1px sentinel at the very top of the document and an
 * IntersectionObserver rather than a window scroll listener, so it works whichever
 * element ends up being the page's scroller.
 */
export function MarketingHeader({ children }: { children: React.ReactNode }) {
  const [scrolled, setScrolled] = React.useState(false);
  const sentinel = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} aria-hidden className="pointer-events-none absolute left-0 top-0 h-3 w-px" />
      <header
        data-scrolled={scrolled ? "" : undefined}
        className="mps-mhead sticky top-0 z-40 px-2 pb-1 pt-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:px-4"
      >
        <div className="mps-mhead__bar mx-auto flex items-center justify-between gap-2 px-3 sm:px-5">{children}</div>
      </header>
    </>
  );
}
