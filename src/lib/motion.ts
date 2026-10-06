/**
 * MultiPost Studio motion system — the single source for how things move.
 *
 * Three speeds, one easing, GPU-friendly properties only (opacity + transform):
 *   micro     hover, press, colour and border changes, small icon moves
 *   standard  cards, menus, tabs, tooltips, modal content
 *   large     page entrances, drawers, big panels
 *
 * The same numbers exist as CSS custom properties (see :root in globals.css) so
 * plain CSS and `motion` variants always agree. Components should import from
 * here (or use the CSS tokens) instead of inventing timings.
 */

export const DURATION = { micro: 0.14, standard: 0.24, large: 0.4 } as const;

/** Soft deceleration: quick start, gentle landing. Feels fast without snapping. */
export const EASE = [0.16, 1, 0.3, 1] as const;

export const SPRING = { type: "spring", stiffness: 320, damping: 30, mass: 0.9 } as const;
export const SPRING_SOFT = { type: "spring", stiffness: 220, damping: 28, mass: 0.9 } as const;

/** Use with `motion` components: <motion.div variants={fadeIn} initial="hidden" animate="show" />. */
export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: DURATION.standard, ease: EASE } },
};

export const slideUp = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.97 },
  show: { opacity: 1, scale: 1, transition: { duration: DURATION.standard, ease: EASE } },
};

/** Dashboard-style entrance: opacity + small rise + tiny scale. Subtle on purpose. */
export const cardEnter = {
  hidden: { opacity: 0, y: 10, scale: 0.985 },
  show: { opacity: 1, y: 0, scale: 1, transition: { duration: DURATION.large, ease: EASE } },
};

export const staggerContainer = (stagger = 0.06, delay = 0) => ({
  hidden: {},
  show: { transition: { staggerChildren: stagger, delayChildren: delay } },
});

export const modalEnter = {
  hidden: { opacity: 0, scale: 0.96, y: 8 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.standard, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: DURATION.micro, ease: EASE } },
};

export const dropdownEnter = {
  hidden: { opacity: 0, scale: 0.97, y: -4 },
  show: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.micro + 0.04, ease: EASE } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: DURATION.micro, ease: EASE } },
};

export const pageTransition = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: DURATION.large, ease: EASE } },
};

/** Props for <motion.button>/<motion.div> press + hover feedback. */
export const buttonPress = { whileHover: { scale: 1.015 }, whileTap: { scale: 0.98 }, transition: SPRING } as const;
export const cardHover = { whileHover: { y: -3 }, whileTap: { scale: 0.995 }, transition: SPRING } as const;

/** Stagger delay for the nth item, capped so long lists don't take forever to appear. */
export function staggerDelay(index: number, step = 0.05, max = 8): number {
  return Math.min(Math.max(0, index), max) * step;
}
