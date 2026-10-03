"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;
const SPRING = { type: "spring", stiffness: 220, damping: 30, mass: 0.9 } as const;

/** IntersectionObserver-based visibility — reliable across dev HMR / RSC. */
function useInView<T extends HTMLElement>(once = true) {
  const ref = React.useRef<T>(null);
  const [seen, setSeen] = React.useState(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Already on-screen at mount (e.g. above the fold, or fast scroll landed
    // here before IO attached)? Reveal now — don't wait for an IO callback.
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight && r.bottom > 0) {
      setSeen(true);
      if (once) return;
    }
    // Fallback: if IO never fires, reveal anyway.
    const t = setTimeout(() => setSeen(true), 400);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setSeen(true);
            if (once) io.disconnect();
          } else if (!once) {
            setSeen(false);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    io.observe(el);
    return () => {
      clearTimeout(t);
      io.disconnect();
    };
  }, [once]);

  return { ref, seen };
}

/** Fade + rise on scroll into view. */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  once = true,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  once?: boolean;
  className?: string;
  as?: "div" | "section" | "li" | "span";
}) {
  const reduce = useReducedMotion();
  const { ref, seen } = useInView<HTMLElement>(once);
  const Tag = as as React.ElementType;
  return (
    <Tag
      ref={ref}
      className={className}
      style={{
        opacity: seen || reduce ? 1 : 0,
        transform: seen || reduce ? "none" : `translateY(${y}px)`,
        transition: reduce ? undefined : `opacity 0.6s ${cssEase} ${delay}s, transform 0.6s ${cssEase} ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </Tag>
  );
}

const cssEase = "cubic-bezier(0.16,1,0.3,1)";

const StaggerCtx = React.createContext<boolean>(true);

/** Container that reveals its <StaggerItem> children as it scrolls into view. */
export function Stagger({ children, className }: { children: React.ReactNode; className?: string }) {
  const { ref, seen } = useInView<HTMLDivElement>(true);
  return (
    <div ref={ref} className={className}>
      <StaggerCtx.Provider value={seen}>{children}</StaggerCtx.Provider>
    </div>
  );
}

export function StaggerItem({
  children,
  className,
  index = 0,
}: {
  children: React.ReactNode;
  className?: string;
  index?: number;
}) {
  const seen = React.useContext(StaggerCtx);
  const reduce = useReducedMotion();
  const d = Math.min(index, 8) * 0.05;
  return (
    <div
      className={className}
      style={{
        opacity: seen || reduce ? 1 : 0,
        transform: seen || reduce ? "none" : "translateY(16px)",
        transition: reduce ? undefined : `opacity 0.5s ${cssEase} ${d}s, transform 0.5s ${cssEase} ${d}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/** Subtle hover/press affordance. */
export function Tappable({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { y: -3 }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

/** Count-up number for stats. */
export function CountUp({ to, suffix = "", duration = 1.4 }: { to: number; suffix?: string; duration?: number }) {
  const reduce = useReducedMotion();
  const [val, setVal] = React.useState(reduce ? to : 0);
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      const start = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / (duration * 1000));
        const eased = 1 - Math.pow(1 - p, 3);
        setVal(Math.round(to * eased));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        run();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    // Safety net: run anyway shortly after mount so the number never sticks at 0.
    const t = setTimeout(run, 600);
    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, [to, duration, reduce]);

  return (
    <span ref={ref} className="tabular-nums">
      {val.toLocaleString()}
      {suffix}
    </span>
  );
}

/** Fade in on scroll into view (no vertical travel — for content that must
 *  appear naturally without motion distraction). */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const { ref, seen } = useInView<HTMLDivElement>(true);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen || reduce ? 1 : 0,
        transition: reduce ? undefined : `opacity 0.5s ${cssEase} ${delay}s`,
        willChange: "opacity",
      }}
    >
      {children}
    </div>
  );
}

/** Scale-in on scroll into view — cards, modals, media. GPU-friendly. */
export function ScaleIn({
  children,
  delay = 0,
  className,
  from = 0.96,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  from?: number;
}) {
  const reduce = useReducedMotion();
  const { ref, seen } = useInView<HTMLDivElement>(true);
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen || reduce ? 1 : 0,
        transform: seen || reduce ? "none" : `scale(${from})`,
        transition: reduce ? undefined : `opacity 0.45s ${cssEase} ${delay}s, transform 0.45s ${cssEase} ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/** Horizontal slide-in on scroll into view. */
export function SlideIn({
  children,
  delay = 0,
  className,
  direction = "left",
  distance = 24,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  direction?: "left" | "right";
  distance?: number;
}) {
  const reduce = useReducedMotion();
  const { ref, seen } = useInView<HTMLDivElement>(true);
  const x = direction === "left" ? -distance : distance;
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: seen || reduce ? 1 : 0,
        transform: seen || reduce ? "none" : `translateX(${x}px)`,
        transition: reduce ? undefined : `opacity 0.55s ${cssEase} ${delay}s, transform 0.55s ${cssEase} ${delay}s`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}

/** Route-level entrance — wrap page content for a consistent fade/slide
 *  transition between navigations. Respects reduced motion. */
export function PageTransition({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0.01 : 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

/** Card hover lift — transform + shadow only, no layout cost. */
export function HoverLift({
  children,
  className,
  lift = -4,
}: {
  children: React.ReactNode;
  className?: string;
  lift?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      whileHover={reduce ? undefined : { y: lift }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      transition={SPRING}
    >
      {children}
    </motion.div>
  );
}

/** Button with press/hover physics baked in. */
export function AnimatedButton({
  children,
  className,
  onClick,
  type = "button",
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  type?: "button" | "submit" | "reset";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.button
      type={type}
      onClick={onClick}
      className={className}
      whileHover={reduce ? undefined : { y: -1 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={SPRING}
    >
      {children}
    </motion.button>
  );
}

export { motion, EASE_OUT, SPRING };

/* Canonical aliases so call sites share one vocabulary:
   FadeUp / RevealOnScroll (rise), StaggerContainer / StaggerChild (stagger). */
export { Reveal as FadeUp, Reveal as RevealOnScroll };
export { Stagger as StaggerContainer, StaggerItem as StaggerChild };
