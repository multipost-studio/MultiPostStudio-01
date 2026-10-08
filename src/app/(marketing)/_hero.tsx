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
import { Magnetic, Parallax, SplitReveal } from "@/components/motion";
import { DemoNote, HeroDashboard } from "./_visuals";
import { AccentWord, HeroBackdrop, StageChips } from "./_hero-fx";

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

/* Network badges orbiting the product window (tablet and up). */
const STAGE_BADGES = [
  { p: "linkedin", cls: "mps-hx-sb--1" },
  { p: "youtube", cls: "mps-hx-sb--2" },
  { p: "tiktok", cls: "mps-hx-sb--3" },
  { p: "pinterest", cls: "mps-hx-sb--4" },
  { p: "x", cls: "mps-hx-sb--5" },
  { p: "threads", cls: "mps-hx-sb--6" },
] as const;

function StageBadges() {
  return (
    <>
      {STAGE_BADGES.map((b) => (
        <span key={b.p} aria-hidden className={`mps-hx-sb ${b.cls}`}>
          <PlatformBadge platform={b.p} size={46} className="rounded-[15px]" />
        </span>
      ))}
    </>
  );
}

export function MarketingHero({ demoLogin = false }: { demoLogin?: boolean }) {
  return (
    <section className="mps-hx relative isolate overflow-hidden border-b border-[var(--border)] bg-[var(--bg)]">
      <HeroBackdrop />

      <div className="relative z-[3] mx-auto max-w-6xl px-4 pb-14 pt-14 text-center sm:px-6 sm:pb-20 sm:pt-20">
        <Rise d={0.02}>
          <p>
            <span className="mps-eyebrow mps-hx-eyebrow">
              <span className="dot" aria-hidden />
              The social media operating system
            </span>
          </p>
        </Rise>

        <Rise d={0.06}>
          <h1 className="mps-hero-title mx-auto mt-5 max-w-[20ch] font-extrabold text-[var(--text)]">
            Your whole social <AccentWord word="workflow" suffix="," /> in one workspace
          </h1>
        </Rise>

        <Rise d={0.1}>
          <SplitReveal
            text="Plan, create, schedule, publish, engage and analyze across every platform — MultiPost Studio does the busywork so you can focus on the work only you can do."
            className="mps-hero-subhead mx-auto mt-5 max-w-2xl text-[var(--text-muted)]"
          />
        </Rise>

        <Rise d={0.14}>
          <div className="mt-7 flex justify-center">
            <StageChips />
          </div>
        </Rise>

        <Rise d={0.18}>
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
            <div className="mps-hx-stage">
              <div aria-hidden className="mps-hx-stage__glow" />
              <StageBadges />
              <HeroChips />
              <div className="mps-hx-tilt">
                <HeroDashboard />
              </div>
            </div>
          </Parallax>
          <DemoNote />
        </Rise>
      </div>
    </section>
  );
}
