"use client";

import * as React from "react";
import Link from "next/link";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

export type CardCta = { label: string; href: string; disabled: boolean };

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** Rolls a price from its old value to the new one when the billing interval or currency changes. */
function AnimatedPrice({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const [n, setN] = React.useState(value);
  const mv = useMotionValue(value);

  React.useEffect(() => {
    if (reduce) return;
    const controls = animate(mv, value, { duration: 0.75, ease: EASE_OUT });
    const unsub = mv.on("change", (v) => setN(Math.round(v)));
    return () => {
      controls.stop();
      unsub();
    };
  }, [value, reduce, mv]);

  return <span className="tabular-nums">{format(reduce ? value : n)}</span>;
}

/** A checkmark that draws itself when its card scrolls into view. */
function DrawnCheck({ delay }: { delay: number }) {
  const reduce = useReducedMotion();
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden className="mt-0.5 shrink-0 text-[var(--success)]">
      <motion.path
        d="M3 8.5l3.2 3.2L13 4.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0, opacity: 0 }}
        whileInView={{ pathLength: 1, opacity: 1 }}
        viewport={{ once: true, amount: 0.3 }}
        transition={{ delay, duration: 0.4, ease: EASE_OUT }}
      />
    </svg>
  );
}

function CtaButton({ cta, primary, className = "" }: { cta: CardCta; primary: boolean; className?: string }) {
  return cta.disabled ? (
    <Button className={`w-full ${className}`} variant="secondary" disabled>
      {cta.label}
    </Button>
  ) : (
    <Button asChild className={`w-full ${primary ? "mps-btn-shine" : ""} ${className}`} variant={primary ? "primary" : "secondary"}>
      <Link href={cta.href}>{cta.label}</Link>
    </Button>
  );
}

/**
 * One pricing tier. Motion is all disabled under prefers-reduced-motion, and
 * the tilt/spotlight under touch pointers:
 *  - rises in with a spring, staggered by column, when scrolled into view
 *  - hover lifts the card, tilts it a few degrees toward the pointer, and a
 *    soft spotlight follows the cursor
 *  - the price rolls between values when interval/currency change, and the
 *    annual-savings line expands in
 *  - the limit numbers fade up and the feature checkmarks draw in, in sequence
 */
export function PricingCard({
  index,
  name,
  blurb,
  stats,
  highlights,
  inheritsFrom,
  price,
  monthlyPrice,
  annualPrice,
  altPriceLabel,
  interval,
  inr,
  popular,
  isCurrent,
  tone,
  cta,
}: {
  index: number;
  name: string;
  blurb: string | null;
  stats: { value: string; label: string }[];
  highlights: string[];
  /** Name of the plan below this one, for "Everything in X, plus". */
  inheritsFrom: string | null;
  price: number;
  monthlyPrice: number;
  annualPrice: number;
  /** Price in the other currency, e.g. "₹1,499/mo if you bill in India". Null when there is none to show. */
  altPriceLabel: string | null;
  interval: "month" | "year";
  inr: boolean;
  popular: boolean;
  isCurrent: boolean;
  tone: string;
  cta: CardCta;
}) {
  const reduce = useReducedMotion();
  const ref = React.useRef<HTMLDivElement>(null);

  // Pointer-driven tilt: raw targets go through a spring so it eases rather than snaps.
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const tiltX = useSpring(rx, { stiffness: 180, damping: 18 });
  const tiltY = useSpring(ry, { stiffness: 180, damping: 18 });

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el || reduce || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${px * 100}%`);
    el.style.setProperty("--my", `${py * 100}%`);
    ry.set((px - 0.5) * 5);
    rx.set((0.5 - py) * 4);
  }

  function onPointerLeave() {
    rx.set(0);
    ry.set(0);
  }

  // The popular card keeps var(--surface) so its ring is the signal; others take their tier tone.
  const toneStyle = popular ? {} : { background: tone };
  const currency = inr ? "INR" : "USD";
  const fmt = (n: number) => (n === 0 ? (inr ? "₹0" : "$0") : formatCurrency(n, currency));
  const paid = price > 0;
  const saving = paid && interval === "year" ? Math.max(0, monthlyPrice * 12 - annualPrice) : 0;
  const perMonth = paid && interval === "year" ? Math.round(annualPrice / 12) : 0;
  const base = index * 0.08;

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 32, scale: 0.97 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ type: "spring", stiffness: 110, damping: 17, delay: reduce ? 0 : base }}
      className="h-full"
      style={{ perspective: 900 }}
    >
      <motion.div
        ref={ref}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        whileHover={reduce ? undefined : { y: -8 }}
        transition={{ type: "spring", stiffness: 260, damping: 22 }}
        style={reduce ? toneStyle : { rotateX: tiltX, rotateY: tiltY, transformStyle: "preserve-3d", ...toneStyle }}
        aria-current={isCurrent ? "true" : undefined}
        className={`group relative flex h-full flex-col rounded-[var(--radius-lg)] border p-6 transition-shadow duration-300 hover:shadow-[var(--shadow-lg)] ${
          popular ? "mps-gradient-ring border-[var(--primary)] bg-[var(--surface)] shadow-md" : "border-transparent"
        }`}
      >
        {/* Cursor spotlight */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 0%), color-mix(in srgb, var(--primary) 16%, transparent), transparent 70%)" }}
        />

        <div className="relative flex items-center justify-between gap-2">
          <h2 className="text-[17px] font-semibold text-[var(--text)]">{name}</h2>
          {popular ? (
            <motion.span animate={reduce ? undefined : { y: [0, -3, 0] }} transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }} className="inline-flex">
              <Badge tone="primary">Most popular</Badge>
            </motion.span>
          ) : isCurrent ? (
            <Badge tone="success" dot>
              Your plan
            </Badge>
          ) : null}
        </div>

        <div className="relative mt-3 min-h-[5.5rem]">
          <p className="text-[2rem] font-bold leading-none tracking-tight text-[var(--text)]">
            <AnimatedPrice value={price} format={fmt} />
            {paid && (
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={interval}
                  initial={reduce ? false : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={reduce ? undefined : { opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  className="ml-1 inline-block text-[14px] font-normal tracking-normal text-[var(--text-subtle)]"
                >
                  {interval === "year" ? "/year" : "/month"}
                </motion.span>
              </AnimatePresence>
            )}
          </p>
          {!paid && <p className="mt-1.5 text-[12.5px] text-[var(--text-muted)]">Free forever, no card needed</p>}
          <AnimatePresence initial={false}>
            {saving > 0 && (
              <motion.div
                key="saving"
                initial={reduce ? false : { opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={reduce ? undefined : { opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-[var(--text-muted)]">
                  <span className="whitespace-nowrap">about {fmt(perMonth)}/mo</span>
                  <span className="whitespace-nowrap rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[11.5px] font-semibold text-[var(--success)]">Save {fmt(saving)}</span>
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          {paid && altPriceLabel && <p className="mt-1.5 text-[12px] leading-snug text-[var(--text-subtle)]">{altPriceLabel}</p>}
        </div>

        {blurb && <p className="relative mt-3 text-[13.5px] leading-snug text-[var(--text-muted)]">{blurb}</p>}

        <dl className="relative mt-5 grid grid-cols-2 gap-x-3 gap-y-4 border-y border-[var(--border)]/70 py-4">
          {stats.map((s, i) => (
            <motion.div
              key={s.label}
              initial={reduce ? false : { opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ delay: base + 0.15 + i * 0.04, duration: 0.4, ease: EASE_OUT }}
            >
              <dt className="sr-only">{s.label}</dt>
              <dd className="text-[17px] font-semibold leading-tight tabular-nums text-[var(--text)]">{s.value}</dd>
              <dd className="mt-0.5 text-[12px] leading-tight text-[var(--text-muted)]" aria-hidden>
                {s.label}
              </dd>
            </motion.div>
          ))}
        </dl>

        <div className="relative mt-4 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--text-subtle)]">{inheritsFrom ? `Everything in ${inheritsFrom}, plus` : "Includes"}</p>
          <ul className="mt-2.5 space-y-2 text-[13px] text-[var(--text-muted)]">
            {highlights.map((f, i) => (
              <motion.li
                key={f}
                initial={reduce ? false : { opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ delay: base + 0.3 + i * 0.05, duration: 0.35, ease: EASE_OUT }}
                className="flex gap-2"
              >
                <DrawnCheck delay={base + 0.35 + i * 0.05} />
                {f}
              </motion.li>
            ))}
          </ul>
        </div>

        <CtaButton cta={cta} primary={popular} className="relative mt-6" />
      </motion.div>
    </motion.div>
  );
}

/** Enterprise: not a price tag but a conversation, so it gets a wide banner instead of a fifth card. */
export function EnterpriseBanner({ name, blurb, features, cta }: { name: string; blurb: string | null; features: string[]; cta: CardCta }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, ease: EASE_OUT }}
      whileHover={reduce ? undefined : { y: -3 }}
      className="mt-4 grid items-center gap-5 rounded-[var(--radius-lg)] border border-transparent p-6 transition-shadow duration-300 hover:shadow-[var(--shadow-lg)] md:grid-cols-[1fr_auto] lg:grid-cols-[minmax(0,260px)_1fr_auto]"
      style={{ background: "var(--block-mint)" }}
    >
      <div>
        <h2 className="text-[17px] font-semibold text-[var(--text)]">{name}</h2>
        <p className="mt-2 text-[2rem] font-bold leading-none tracking-tight text-[var(--text)]">Custom</p>
        {blurb && <p className="mt-2 text-[13.5px] leading-snug text-[var(--text-muted)]">{blurb}</p>}
      </div>
      <ul className="grid gap-x-6 gap-y-2 text-[13px] text-[var(--text-muted)] sm:grid-cols-2 md:col-span-2 md:row-start-2 lg:col-span-1 lg:row-start-auto">
        {features.map((f, i) => (
          <li key={f} className="flex gap-2">
            <DrawnCheck delay={0.2 + i * 0.05} />
            {f}
          </li>
        ))}
      </ul>
      <CtaButton cta={cta} primary={false} className="md:w-auto md:min-w-[11rem]" />
    </motion.div>
  );
}
