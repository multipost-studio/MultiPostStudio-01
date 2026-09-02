"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

// Demo credentials are shown only outside production (or when explicitly opted
// in). Both values are build-time inlined by Next.
const SHOW_DEMO =
  process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_DEMO === "1";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "@/components/brand";
import { DashboardMock } from "./_visuals";
import { PLATFORM_KEYS } from "@/lib/constants";

/* CSS-only staggered rise — reliable above the fold. */
function Rise({ d = 0, children, className }: { d?: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`cad-rise ${className ?? ""}`} style={{ animationDelay: `${d}s` }}>
      {children}
    </div>
  );
}

/* Scattered platform marks that gently float around the hero. */
const SPOTS = [
  { p: "youtube", cls: "left-[4%] top-[14%]", s: 40 },
  { p: "pinterest", cls: "right-[6%] top-[8%]", s: 44 },
  { p: "linkedin", cls: "left-[10%] top-[46%]", s: 36 },
  { p: "instagram", cls: "left-[3%] bottom-[16%]", s: 42 },
  { p: "tiktok", cls: "right-[4%] bottom-[24%]", s: 38 },
  { p: "x", cls: "right-[12%] top-[42%]", s: 34 },
  { p: "bluesky", cls: "left-[22%] top-[6%]", s: 30 },
  { p: "threads", cls: "right-[22%] bottom-[8%]", s: 32 },
  { p: "facebook", cls: "right-[2%] top-[62%]", s: 36 },
  { p: "gbp", cls: "left-[6%] top-[74%]", s: 30 },
];

function FloatIcons() {
  const reduce = useReducedMotion();
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block" aria-hidden>
      {SPOTS.map((s, i) => (
        <motion.div
          key={s.p}
          className={`absolute ${s.cls}`}
          animate={reduce ? undefined : { y: [0, -10, 0], rotate: [0, i % 2 ? 4 : -4, 0] }}
          transition={{ duration: 5 + (i % 4), repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
        >
          <PlatformBadge platform={s.p} size={s.s} className="rounded-[12px] shadow-[var(--shadow)] ring-2 ring-[var(--bg-elevated)]" />
        </motion.div>
      ))}
    </div>
  );
}

function EmailCapture() {
  const router = useRouter();
  const [email, setEmail] = React.useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        router.push(`/signup${email ? `?email=${encodeURIComponent(email)}` : ""}`);
      }}
      className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2.5 sm:flex-row"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your work email…"
        aria-label="Work email"
        className="h-[52px] flex-1 rounded-[var(--radius)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 text-[16px] text-[var(--text)] placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus:outline-none focus:ring-2 focus:ring-[var(--primary-soft)]"
      />
      <Button type="submit" size="lg" className="h-[52px] shrink-0 px-6 text-[16px]">
        Get started free
      </Button>
    </form>
  );
}

export function MarketingHero() {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--bg)]">
      <FloatIcons />

      <div className="relative z-[3] mx-auto max-w-3xl px-5 pb-14 pt-16 text-center sm:pt-20">
        <Rise>
          <h1 className="mx-auto max-w-[14ch] text-[2.6rem] font-semibold leading-[1.08] tracking-[-0.02em] text-[var(--text)] sm:text-[3.4rem]">
            Your whole social <span className="cad-serif">workflow</span>, in one workspace
          </h1>
        </Rise>
        <Rise d={0.06}>
          <p className="mx-auto mt-5 max-w-lg text-[17px] leading-relaxed text-[var(--text-muted)] sm:text-[18px]">
            Plan, create, publish, engage and analyze across every platform — Cadence
            does the busywork so you can focus on the work only you can do.
          </p>
        </Rise>
        <Rise d={0.12}>
          <EmailCapture />
        </Rise>
        <Rise d={0.16}>
          <p className="mt-3 text-[13.5px] text-[var(--text-subtle)]">
            No card needed · Free forever plan
            {SHOW_DEMO ? " · Demo: demo@cadence.app / demo1234" : ""}
          </p>
        </Rise>

        <Rise d={0.24}>
          <div className="mx-auto mt-12 w-full max-w-2xl">
            <DashboardMock />
          </div>
        </Rise>

        <Rise d={0.3}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5">
            {PLATFORM_KEYS.map((p) => (
              <PlatformBadge key={p} platform={p} size={26} className="rounded-[7px]" />
            ))}
          </div>
        </Rise>
      </div>
    </section>
  );
}
