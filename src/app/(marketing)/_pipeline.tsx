"use client";

import * as React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Lightbulb, PenLine, CalendarDays, CheckCheck, Send, MessageCircle, BarChart3, Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  { label: "Ideate", icon: Lightbulb },
  { label: "Create", icon: PenLine },
  { label: "Plan", icon: CalendarDays },
  { label: "Approve", icon: CheckCheck },
  { label: "Publish", icon: Send },
  { label: "Engage", icon: MessageCircle },
  { label: "Analyze", icon: BarChart3 },
  { label: "Optimize", icon: Rocket },
];

export function WorkflowPipeline() {
  const reduce = useReducedMotion();
  const [active, setActive] = React.useState(0);
  const [paused, setPaused] = React.useState(false);

  React.useEffect(() => {
    if (reduce || paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 1000);
    return () => clearInterval(id);
  }, [reduce, paused]);

  return (
    <div
      className="border-b border-[var(--border)] bg-[var(--bg)] py-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mx-auto max-w-5xl px-5">
        <p className="mb-8 text-center text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">
          One workflow, start to finish
        </p>
        <ol className="relative grid grid-cols-4 gap-y-6 sm:grid-cols-8">
          <div className="pointer-events-none absolute left-6 right-6 top-6 hidden h-px bg-[var(--border-strong)] sm:block" />
          {STAGES.map((s, i) => {
            const on = i === active;
            return (
              <li key={s.label} className="relative flex flex-col items-center gap-2">
                <motion.button
                  onMouseEnter={() => setActive(i)}
                  animate={reduce ? undefined : { scale: on ? 1.12 : 1 }}
                  transition={{ type: "spring", stiffness: 320, damping: 20 }}
                  className={cn(
                    "relative flex h-12 w-12 items-center justify-center rounded-[var(--radius)] border transition-colors",
                    on
                      ? "border-transparent bg-[var(--primary)] text-[var(--primary-text)] shadow-[var(--shadow)]"
                      : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-muted)]",
                  )}
                >
                  {on && !reduce && (
                    <motion.span
                      layoutId="pipe-glow"
                      className="absolute inset-0 rounded-[var(--radius)] bg-[var(--primary)]"
                      style={{ filter: "blur(16px)", opacity: 0.45 }}
                      transition={{ type: "spring", stiffness: 260, damping: 24 }}
                    />
                  )}
                  <s.icon size={18} className="relative z-10" />
                </motion.button>
                <span className={cn("text-[12px] font-bold uppercase tracking-wide", on ? "text-[var(--text)]" : "text-[var(--text-subtle)]")}>
                  {s.label}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
