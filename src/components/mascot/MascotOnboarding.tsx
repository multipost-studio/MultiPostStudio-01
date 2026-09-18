"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TOUR_STEPS } from "./mascot-config";

/**
 * "Show me around" walkthrough. Each step navigates to a REAL existing
 * route and describes the visible UI — no duplicate fake UI, no fragile
 * DOM-anchored pointing. Reliability over gimmicks.
 */
export function MascotOnboarding({
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
  const isLast = step >= TOUR_STEPS.length - 1;

  return (
    <motion.div
      role="status"
      aria-label={`Tour step ${step + 1} of ${TOUR_STEPS.length}: ${current.title}`}
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn(
        "pointer-events-auto w-[min(320px,calc(100vw-5.5rem))]",
        "rounded-[var(--radius-lg)] border border-[var(--border-strong)]",
        "bg-[var(--bg-elevated)] p-3.5 shadow-lg",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">
          Step {step + 1} of {TOUR_STEPS.length} · {current.routeLabel}
        </p>
        <button
          type="button"
          onClick={onSkip}
          aria-label="End tour"
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <p className="mt-1.5 text-[14px] font-semibold leading-snug text-[var(--text)]">{current.title}</p>
      <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">{current.body}</p>

      <div className="mt-2 flex items-center gap-1" aria-hidden>
        {TOUR_STEPS.map((s, i) => (
          <span
            key={s.routeLabel}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= step ? "bg-[var(--primary)]" : "bg-[var(--border-strong)]",
            )}
          />
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onBack}
          disabled={step === 0}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1.5 text-[13px] font-semibold text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-40"
        >
          <ArrowLeft size={14} aria-hidden />
          Back
        </button>
        <button
          type="button"
          onClick={onNext}
          className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] bg-[var(--primary)] px-3 py-1.5 text-[13px] font-semibold text-[var(--primary-text)] hover:bg-[var(--primary-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          {isLast ? "Finish" : "Next"}
          {!isLast && <ArrowRight size={14} aria-hidden />}
        </button>
      </div>
    </motion.div>
  );
}
