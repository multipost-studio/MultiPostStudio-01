"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";

// Demo credentials: always shown in development; in production only when a
// platform admin enables the `demo_login` flag in /admin/flags (passed down
// from the page, which reads it server-side).
const DEV = process.env.NODE_ENV !== "production";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformBadge } from "@/components/brand";
import { FluidOrb } from "@/components/fluid-orb";
import { DashboardMock } from "./_visuals";
import { PLATFORM_KEYS } from "@/lib/constants";

/* CSS-only staggered rise — reliable above the fold. */
function Rise({ d = 0, children, className }: { d?: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mps-rise ${className ?? ""}`} style={{ animationDelay: `${d}s` }}>
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
    <div className="pointer-events-none absolute inset-0 mx-auto max-w-6xl overflow-hidden hidden lg:block" aria-hidden>
      {SPOTS.map((s, i) => (
        <motion.div
          key={s.p}
          className={`absolute ${s.cls}`}
          animate={reduce ? undefined : { y: [0, -10, 0], rotate: [0, i % 2 ? 4 : -4, 0] }}
          transition={{ duration: 5 + (i % 4), repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
        >
          <PlatformBadge platform={s.p} size={s.s} className="rounded-[12px] shadow-[var(--shadow-sm)] ring-2 ring-[var(--bg-elevated)]" />
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
      className="mx-auto mt-7 flex w-full max-w-md flex-col gap-2.5 sm:flex-row"
    >
      <Input
        size="lg"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your work email…"
        aria-label="Work email"
        className="h-12 w-full sm:flex-1 shadow-xs"
      />
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto shrink-0">
        Get started free
      </Button>
    </form>
  );
}

export function MarketingHero({ demoLogin = false }: { demoLogin?: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--bg)]">
      {/* Soft drifting colour behind the headline. Sits under the float icons
          and the content (z below both), aria-hidden, pauses off-screen. */}
      <FluidOrb
        className="absolute left-1/2 top-0 z-[1] -translate-x-1/2 -translate-y-1/4 opacity-70 blur-[2px]"
        size={640}
        intensity={0.42}
      />
      <FloatIcons />

      <div className="relative z-[3] mx-auto max-w-3xl px-4 pb-12 pt-12 text-center sm:px-6 sm:pb-16 sm:pt-18">
        <Rise>
          <h1 className="mps-hero-title mx-auto max-w-[22ch] font-semibold text-[var(--text)]">
            Your whole social <span className="mps-serif">workflow</span>, in one workspace
          </h1>
        </Rise>
        <Rise d={0.06}>
          <p className="mps-hero-subhead mx-auto mt-4 max-w-xl text-[var(--text-muted)]">
            Plan, create, publish, engage and analyze across every platform — MultiPost Studio
            does the busywork so you can focus on the work only you can do.
          </p>
        </Rise>
        <Rise d={0.12}>
          <EmailCapture />
        </Rise>
        <Rise d={0.16}>
          <p className="mt-3 text-[13px] text-[var(--text-subtle)]">
            No card needed · Free forever plan
            {DEV || demoLogin ? " · Demo: demo@multipoststudio.app / demo1234" : ""}
          </p>
        </Rise>

        <Rise d={0.24}>
          <div className="mx-auto mt-10 w-full max-w-2xl sm:mt-12">
            <DashboardMock />
          </div>
        </Rise>

        <Rise d={0.3}>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
            {PLATFORM_KEYS.map((p) => (
              <PlatformBadge key={p} platform={p} size={28} className="rounded-[8px] transition-transform hover:scale-105" />
            ))}
          </div>
        </Rise>
      </div>
    </section>
  );
}
