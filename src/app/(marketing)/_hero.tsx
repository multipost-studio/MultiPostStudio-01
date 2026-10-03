"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, PlayCircle, CalendarCheck2, Gauge } from "lucide-react";

// Demo credentials: always shown in development; in production only when a
// platform admin enables the `demo_login` flag in /admin/flags (passed down
// from the page, which reads it server-side).
const DEV = process.env.NODE_ENV !== "production";
import { Button } from "@/components/ui/button";
import { PlatformBadge } from "@/components/brand";
import { FluidOrb } from "@/components/fluid-orb";
import { Magnetic, Parallax, SplitReveal } from "@/components/motion";
import { DemoNote, HeroDashboard } from "./_visuals";
import { PLATFORM_KEYS } from "@/lib/constants";

/* CSS-only staggered rise — reliable above the fold. */
function Rise({ d = 0, children, className }: { d?: number; children: React.ReactNode; className?: string }) {
  return (
    <div className={`mps-rise ${className ?? ""}`} style={{ animationDelay: `${d}s` }}>
      {children}
    </div>
  );
}

/* Small floating proof chips over the product window (desktop only). */
function HeroChips() {
  return (
    <>
      <div
        aria-hidden
        className="absolute -left-6 top-16 z-[4] hidden items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow-lg)] xl:flex"
      >
        <PlatformBadge platform="instagram" size={24} className="rounded-[7px]" />
        <span>
          <span className="block text-[12px] font-bold text-[var(--text)]">Scheduled · Tue 9:00</span>
          <span className="block text-[11px] text-[var(--text-subtle)]">Queue A · first comment on</span>
        </span>
      </div>
      <div
        aria-hidden
        className="absolute -right-6 bottom-20 z-[4] hidden items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow-lg)] xl:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--success-soft)] text-[var(--success)]">
          <Gauge size={16} />
        </span>
        <span>
          <span className="block text-[12px] font-bold text-[var(--text)]">Content score 92</span>
          <span className="block text-[11px] text-[var(--text-subtle)]">Ready to publish</span>
        </span>
      </div>
      <div
        aria-hidden
        className="absolute -right-4 top-10 z-[4] hidden items-center gap-2 rounded-[12px] border border-[var(--border)] bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow-lg)] xl:flex"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
          <CalendarCheck2 size={16} />
        </span>
        <span>
          <span className="block text-[12px] font-bold text-[var(--text)]">11 posts this week</span>
          <span className="block text-[11px] text-[var(--text-subtle)]">across 6 channels</span>
        </span>
      </div>
    </>
  );
}

export function MarketingHero({ demoLogin = false }: { demoLogin?: boolean }) {
  return (
    <section className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--bg)]">
      {/* Soft drifting colour behind the headline. Sits under the content,
          aria-hidden, pauses off-screen. */}
      <FluidOrb
        className="absolute left-1/2 top-0 z-[1] -translate-x-1/2 -translate-y-1/4 opacity-70 blur-[2px]"
        size={640}
        intensity={0.42}
      />

      <div className="relative z-[3] mx-auto max-w-6xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-20">
        <Rise d={0.02}>
          <p>
            <span className="mps-eyebrow">
              <span className="dot" aria-hidden />
              The social media operating system
            </span>
          </p>
        </Rise>

        <Rise d={0.06}>
          <h1 className="mps-hero-title mx-auto mt-5 max-w-[20ch] font-extrabold text-[var(--text)]">
            Your whole social <span className="mps-serif">workflow</span>, in one workspace
          </h1>
        </Rise>

        <Rise d={0.1}>
          <SplitReveal
            text="Plan, create, schedule, publish, engage and analyze across every platform — MultiPost Studio does the busywork so you can focus on the work only you can do."
            className="mps-hero-subhead mx-auto mt-5 max-w-2xl text-[var(--text-muted)]"
          />
        </Rise>

        <Rise d={0.16}>
          <div className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Magnetic strength={0.3} className="w-full sm:w-auto">
              <Button asChild size="lg" className="mps-btn-shine h-12 w-full px-7 text-[15px] sm:w-auto">
                <Link href="/signup">
                  Get started free <ArrowRight size={16} />
                </Link>
              </Button>
            </Magnetic>
            <Button asChild size="lg" variant="secondary" className="h-12 w-full px-7 text-[15px] sm:w-auto">
              <Link href="#how-it-works">
                <PlayCircle size={16} /> See how it works
              </Link>
            </Button>
          </div>
        </Rise>

        <Rise d={0.2}>
          <p className="mt-4 text-[13px] font-medium text-[var(--text-subtle)]">
            Free forever plan · No credit card required
            {DEV || demoLogin ? " · Demo: demo@multipoststudio.app / demo1234" : ""}
          </p>
        </Rise>

        {/* The product is the hero: full workspace window, large. */}
        <Rise d={0.26}>
          <Parallax distance={28} className="relative mx-auto mt-12 w-full max-w-5xl sm:mt-14">
            <HeroChips />
            <HeroDashboard />
          </Parallax>
          <DemoNote />
        </Rise>

        <Rise d={0.32}>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-1.5 sm:gap-2" aria-label="Supported platforms">
            {PLATFORM_KEYS.map((p) => (
              <PlatformBadge key={p} platform={p} size={28} className="rounded-[8px] transition-transform hover:scale-105" />
            ))}
          </div>
        </Rise>
      </div>
    </section>
  );
}
