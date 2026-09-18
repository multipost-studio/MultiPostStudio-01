"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { MASCOT_DIRECTIONS, MASCOT_LABEL, MASCOT_REACTIONS } from "./mascot-config";

const Mascot = dynamic(() => import("page-mascot").then((m) => m.Mascot), {
  ssr: false,
  loading: () => (
    <span
      aria-hidden
      className="block h-full w-full animate-pulse rounded-full bg-[var(--surface-hover)]"
    />
  ),
});

/**
 * Small companion figure for in-place empty states.
 *
 * Rendered `inert` + `aria-hidden`: purely decorative, zero tab stops and
 * zero screen-reader noise. Cursor tracking still works (visual delight),
 * clicks are intentionally disabled — the empty state's own action button
 * is the single interaction.
 */
export function MascotFigure({ size = 72 }: { size?: number }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  return (
    <div
      inert
      aria-hidden
      data-mascot-figure
      style={{ width: size, height: size }}
      className="pointer-events-none select-none"
    >
      {mounted && (
        <Mascot
          directions={MASCOT_DIRECTIONS}
          reactions={MASCOT_REACTIONS}
          size={size}
          label={MASCOT_LABEL}
        />
      )}
    </div>
  );
}
