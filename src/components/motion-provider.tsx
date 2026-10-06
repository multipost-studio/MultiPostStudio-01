"use client";

import * as React from "react";
import { MotionConfig } from "motion/react";

/**
 * Applies the user's reduced-motion preference to every `motion` component in
 * the app at once: transform and layout animations are skipped, opacity
 * transitions are kept. (CSS animations are handled by the global
 * prefers-reduced-motion rule in globals.css.)
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
