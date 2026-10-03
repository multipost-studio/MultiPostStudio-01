"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  Heart, MessageCircle, Repeat2, Bookmark, Star, Check,
  LayoutDashboard, CalendarDays, PenSquare, Inbox, BarChart3,
  Sparkles, BadgeCheck, Clock, Send, ImagePlus, Link2,
} from "lucide-react";
import { LogoMark, PlatformBadge } from "@/components/brand";
import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from "@/lib/constants";
import { cn, seededRandom, photoUrl } from "@/lib/utils";

/* Real portrait photo, deterministic per name. */
export function Portrait({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("block overflow-hidden bg-[var(--bg-sunken)]", className)} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photoUrl(name)}
        alt=""
        loading="lazy"
        className="h-full w-full object-cover"
      />
    </span>
  );
}

/** Real portrait photo, deterministic per name (small avatar contexts). */
export function Identicon({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("block overflow-hidden bg-[var(--bg-sunken)]", className)} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={photoUrl(name)} alt="" loading="lazy" className="h-full w-full object-cover" />
    </span>
  );
}

/* ─────────────────────────  DOODLES  ───────────────────────── */

export function Squiggle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 40" fill="none" className={className} aria-hidden>
      <path
        d="M2 20c14-22 24 22 38 0s24 22 38 0 24 22 40 4"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path d="M112 24l8-4-6-7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 0c.6 6 4.4 10.4 12 12-7.6 1.6-11.4 6-12 12-.6-6-4.4-10.4-12-12C7.6 10.4 11.4 6 12 0Z" />
    </svg>
  );
}

export function Star4({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M12 1l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6L12 1Z" />
    </svg>
  );
}

export function Asterisk({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className={className} aria-hidden>
      <path d="M12 3v18M4.5 7.5l15 9M19.5 7.5l-15 9" />
    </svg>
  );
}

export function DoodleField() {
  const reduce = useReducedMotion();
  const items = [
    { C: Sparkle, cls: "left-[6%] top-[22%] h-5 w-5 text-[var(--accent)]", d: 0 },
    { C: Asterisk, cls: "left-[2%] top-[52%] h-6 w-6 text-[var(--primary)]", d: 0.4 },
    { C: Star4, cls: "right-[8%] top-[30%] h-6 w-6 text-[var(--text)]", d: 0.8 },
    { C: Sparkle, cls: "right-[3%] bottom-[26%] h-4 w-4 text-[var(--primary)]", d: 1.2 },
    { C: Star4, cls: "left-[14%] bottom-[10%] h-4 w-4 text-[var(--accent)]", d: 0.6 },
  ];
  return (
    <div className="pointer-events-none absolute inset-0 z-[2]" aria-hidden>
      {items.map(({ C, cls, d }, i) => (
        <motion.span
          key={i}
          className={cn("absolute", cls)}
          animate={reduce ? undefined : { rotate: [0, 20, 0], scale: [1, 1.15, 1] }}
          transition={{ duration: 5 + d, repeat: Infinity, ease: "easeInOut", delay: d }}
        >
          <C className="h-full w-full" />
        </motion.span>
      ))}
      <Squiggle className="absolute left-[16%] top-[40%] hidden h-8 w-24 text-[var(--primary)] opacity-70 sm:block" />
    </div>
  );
}

/* ─────────────────────  FLOATING APP ICONS  ───────────────────── */

export function AppIcon({ platform, size = 44 }: { platform: string; size?: number }) {
  return (
    <span className="inline-flex rounded-[14px] shadow-[0_10px_24px_-8px_rgba(33,26,46,0.35)] ring-2 ring-white/40">
      <PlatformBadge platform={platform} size={size} className="rounded-[14px]" />
    </span>
  );
}

export function FloatingAppIcons() {
  const reduce = useReducedMotion();
  const spots = [
    { p: "instagram", cls: "-left-6 top-4", d: 0 },
    { p: "x", cls: "-left-10 top-1/2", d: 0.5 },
    { p: "linkedin", cls: "left-2 -bottom-6", d: 1 },
    { p: "tiktok", cls: "-right-8 top-8", d: 0.3 },
    { p: "youtube", cls: "-right-10 bottom-10", d: 0.8 },
    { p: "pinterest", cls: "right-4 -bottom-6", d: 1.3 },
  ];
  return (
    <>
      {spots.map((s, i) => (
        <motion.div
          key={i}
          className={cn("absolute hidden sm:block", s.cls)}
          animate={reduce ? undefined : { y: [0, -12, 0] }}
          transition={{ duration: 5 + s.d, repeat: Infinity, ease: "easeInOut", delay: s.d }}
        >
          <AppIcon platform={s.p} size={44} />
        </motion.div>
      ))}
    </>
  );
}

/* ──────────────────────  REACTION BURST  ────────────────────── */

export function ReactionBurst({
  src = "/illustrations/creator-phone.svg",
  className,
}: {
  src?: string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const chips = [
    { Icon: Heart, n: 72, cls: "left-[8%] top-[10%]", tone: "var(--primary)", d: 0 },
    { Icon: MessageCircle, n: 65, cls: "right-[6%] top-[24%]", tone: "var(--accent)", d: 0.4 },
    { Icon: Repeat2, n: 44, cls: "left-[4%] bottom-[22%]", tone: "var(--success)", d: 0.8 },
    { Icon: Bookmark, n: 26, cls: "right-[10%] bottom-[10%]", tone: "var(--warning)", d: 1.2 },
    { Icon: Star, n: 14, cls: "left-[42%] top-[2%]", tone: "var(--primary)", d: 0.6 },
  ];
  return (
    <div className={cn("relative", className)}>
      <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] shadow-[var(--shadow-soft)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="A creator using MultiPost Studio on their phone" className="aspect-[4/3] w-full object-cover" />
      </div>
      {chips.map(({ Icon, n, cls, tone, d }, i) => (
        <motion.div
          key={i}
          className={cn(
            "absolute flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-2.5 py-1 text-[13px] font-bold shadow-md",
            cls,
          )}
          style={{ color: tone }}
          animate={reduce ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 3 + d, repeat: Infinity, ease: "easeInOut", delay: d }}
        >
          <Icon size={13} className="fill-current" />
          {n}
        </motion.div>
      ))}
    </div>
  );
}

/* ────────────────────────  PHOTO STACK  ─────────────────────── */

const STACK_LABELS = ["Editor", "Creator", "Manager", "Client", "Analyst"];

export function PhotoStack() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto flex h-64 w-full max-w-md items-center justify-center">
      {STACK_LABELS.map((label, i) => {
        const offset = i - 2;
        return (
          <motion.div
            key={label}
            initial={false}
            whileHover={reduce ? undefined : { y: -12, zIndex: 20, rotate: 0, scale: 1.04 }}
            className="absolute h-52 w-40 overflow-hidden rounded-[var(--radius-lg)] border-2 border-white bg-white shadow-[var(--shadow)]"
            style={{
              left: `calc(50% - 80px + ${offset * 46}px)`,
              zIndex: 10 - Math.abs(offset),
              transform: `rotate(${offset * 5}deg)`,
            }}
          >
            <Identicon name={label.split(" · ")[0]} className="h-full w-full text-2xl" />
            <span className="absolute bottom-2 left-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary-text)]">
              {label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ────────────────────────  LOGO CLOUD  ─────────────────────── */

const NETWORKS = [
  "Instagram",
  "Facebook",
  "X / Twitter",
  "LinkedIn",
  "TikTok",
  "YouTube",
  "Pinterest",
  "Threads",
  "Bluesky",
];

export function LogoCloud({ label = "Publish directly to all major social networks" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-4xl px-4 py-4 text-center">
      <p className="text-[11.5px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">{label}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5 sm:gap-x-9">
        {NETWORKS.map((l) => (
          <span
            key={l}
            className="inline-flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-[var(--text-muted)] opacity-85 transition-opacity hover:opacity-100"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]/60" />
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────  RATING CHIP  ────────────────────── */

export function RatingChip({
  score = "9 Networks",
  count = "100% Direct Publishing",
}: {
  score?: string;
  count?: string;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-3 pr-4 shadow-sm">
      <span className="text-[13px] font-bold text-[var(--text)]">{score}</span>
      <span className="text-[13px] font-medium text-[var(--text-muted)]">{count}</span>
    </div>
  );
}

/* ─────────────────────  PLATFORM NODE DIAGRAM  ───────────────── */

export function PlatformNodeDiagram() {
  const reduce = useReducedMotion();
  const plats = PLATFORM_KEYS.slice(0, 8);
  const R = 128;
  return (
    <div className="relative mx-auto h-[320px] w-[320px]">
      <svg viewBox="0 0 320 320" className="absolute inset-0" aria-hidden>
        {plats.map((_, i) => {
          const a = (i / plats.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <line
              key={i}
              x1="160"
              y1="160"
              x2={160 + Math.cos(a) * R}
              y2={160 + Math.sin(a) * R}
              stroke="var(--border-strong)"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
          );
        })}
      </svg>
      <div className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[18px] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow)]">
        <LogoMark size={30} />
      </div>
      {plats.map((p, i) => {
        const a = (i / plats.length) * Math.PI * 2 - Math.PI / 2;
        return (
          <motion.div
            key={p}
            className="absolute"
            style={{
              left: `calc(50% + ${Math.cos(a) * R}px - 22px)`,
              top: `calc(50% + ${Math.sin(a) * R}px - 22px)`,
            }}
            animate={reduce ? undefined : { y: [0, -6, 0] }}
            transition={{ duration: 4 + (i % 3), repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}
          >
            <AppIcon platform={p} size={44} />
          </motion.div>
        );
      })}
    </div>
  );
}

/* ───────────────────────  MINI CHARTS (100% Reliable Inline SVG) ─────────────────────── */

export function MiniArea() {
  return (
    <div className="relative h-[88px] w-full overflow-hidden">
      <svg
        viewBox="0 0 280 88"
        fill="none"
        preserveAspectRatio="none"
        className="h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="svg-spark-grad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.28" />
            <stop offset="90%" stopColor="var(--primary)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        <path
          d="M 0 68 Q 24 58, 48 62 T 96 42 T 144 48 T 192 28 T 240 32 T 280 14 L 280 88 L 0 88 Z"
          fill="url(#svg-spark-grad)"
        />
        <path
          d="M 0 68 Q 24 58, 48 62 T 96 42 T 144 48 T 192 28 T 240 32 T 280 14"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="280" cy="14" r="3.5" fill="var(--primary)" />
      </svg>
    </div>
  );
}

export function MiniBars() {
  const bars = [
    { h: 42, c: "var(--primary)" },
    { h: 68, c: "var(--accent)" },
    { h: 54, c: "var(--info)" },
    { h: 82, c: "var(--success)" },
    { h: 48, c: "var(--warning)" },
    { h: 74, c: "var(--primary)" },
  ];
  return (
    <div className="flex h-[88px] w-full items-end justify-between gap-1.5 px-2 pt-2">
      {bars.map((b, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <span
            className="w-full max-w-[20px] rounded-t-[4px] transition-all"
            style={{ height: `${b.h}%`, backgroundColor: b.c }}
          />
        </div>
      ))}
    </div>
  );
}

export function MiniDonut() {
  return (
    <div className="relative flex h-[88px] w-full items-center justify-center">
      <svg viewBox="0 0 80 80" className="h-20 w-20 -rotate-90 transform" aria-hidden="true">
        {/* Background Track */}
        <circle
          cx="40"
          cy="40"
          r="30"
          stroke="var(--bg-sunken)"
          strokeWidth="9"
          fill="none"
        />
        {/* Segment 1: Positive (72%) */}
        <circle
          cx="40"
          cy="40"
          r="30"
          stroke="var(--primary)"
          strokeWidth="9"
          strokeDasharray="188.5"
          strokeDashoffset="52.8"
          strokeLinecap="round"
          fill="none"
        />
        {/* Segment 2: Neutral (20%) */}
        <circle
          cx="40"
          cy="40"
          r="30"
          stroke="var(--accent)"
          strokeWidth="9"
          strokeDasharray="188.5"
          strokeDashoffset="150.8"
          strokeLinecap="round"
          fill="none"
        />
      </svg>
      <div className="absolute flex flex-col items-center justify-center">
        <span className="text-[15px] font-extrabold text-[var(--text)]">72%</span>
        <span className="text-[8.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">Positive</span>
      </div>
    </div>
  );
}

export function MiniHeatmap() {
  return (
    <div className="grid grid-cols-7 gap-1">
      {Array.from({ length: 28 }).map((_, i) => {
        const v = seededRandom("h" + i);
        return (
          <span
            key={i}
            className="aspect-square rounded-[3px]"
            style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(v * 90) + 10}%, transparent)` }}
          />
        );
      })}
    </div>
  );
}

/* ─────────────────────  DASHBOARD MOCK (hero)  ──────────────── */

export function DashboardMock() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={false}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      whileHover={reduce ? undefined : { y: -5 }}
      className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2 sm:px-4 sm:py-2.5 bg-[var(--surface)] min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--primary)]/60" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--warning)]/60" />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--success)]/60" />
          <span className="ml-1.5 sm:ml-2.5 truncate text-[11px] sm:text-[12px] font-semibold text-[var(--text-subtle)]">MultiPost Studio · Analytics</span>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10.5px] sm:text-[11px] font-semibold text-[var(--success)]">
          <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" /> Live sync
        </span>
      </div>
      <div className="p-3.5 sm:p-4">
        {/* KPI stats: 2 cols on mobile, 4 cols on sm+ */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ["Followers", "132.5K", "+8.4%"],
            ["Engagement", "48.9K", "+12%"],
            ["Reach", "1.8M", "+5%"],
            ["Impressions", "3.2M", "+9%"],
          ].map(([k, v, d]) => (
            <div key={k} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:p-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[var(--text-subtle)]">{k}</p>
              <p className="mt-0.5 text-[16px] font-extrabold text-[var(--text)] sm:text-[18px]">{v}</p>
              <p className="text-[11.5px] font-bold text-[var(--success)]">{d}</p>
            </div>
          ))}
        </div>
        {/* Chart row: stacked on xs, 2 cols on sm+ */}
        <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-[1.55fr_1fr]">
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[12px] font-bold text-[var(--text-muted)]">Audience growth</p>
              <span className="text-[11px] font-medium text-[var(--primary)]">+2.4k this week</span>
            </div>
            <MiniArea />
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-1 flex items-center justify-between">
              <p className="text-[12px] font-bold text-[var(--text-muted)]">Sentiment</p>
              <span className="text-[11px] font-medium text-[var(--success)]">Strong positive</span>
            </div>
            <MiniDonut />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────────  BENTO SHOT  ──────────────── */

export function BentoShot({
  tone,
  title,
  body,
  children,
  href,
}: {
  tone: string;
  title: string;
  body: string;
  children: React.ReactNode;
  href?: string;
}) {
  const card = (
    <div className="mps-block mps-block-hover flex h-full flex-col overflow-hidden p-0">
      <div className="flex-1 p-5" style={{ background: tone }}>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 shadow-sm">
          {children}
        </div>
      </div>
      <div className="border-t border-[var(--border)] p-5">
        <h3 className="text-[16px] font-bold text-[var(--text)]">{title}</h3>
        <p className="mt-1 text-[14px] font-medium leading-relaxed text-[var(--text-muted)]">{body}</p>
        {href && (
          <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-[var(--primary)]">
            Learn more →
          </span>
        )}
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {card}
    </Link>
  ) : (
    card
  );
}

export { Check };

/* ─────────────────────  PRODUCT TOUR  ─────────────────────
   A "content calendar" week mock — the scheduling side of the app. */

const TOUR_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// [dayIndex, platformKey] — where posts sit this week.
const TOUR_POSTS: [number, string][] = [
  [0, "instagram"], [0, "linkedin"],
  [1, "x"],
  [2, "instagram"], [2, "tiktok"], [2, "facebook"],
  [3, "linkedin"],
  [4, "youtube"], [4, "x"],
  [5, "instagram"],
];

export function ProductTour() {
  const reduce = useReducedMotion();
  const platformColor = (k: string) => PLATFORMS[k as PlatformKey]?.color ?? "var(--primary)";

  return (
    <motion.div
      initial={false}
      transition={{ type: "spring", stiffness: 300, damping: 26 }}
      whileHover={reduce ? undefined : { y: -6 }}
      className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--warning)]/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]/50" />
        <span className="ml-3 text-[12px] font-semibold text-[var(--text-subtle)]">MultiPost Studio · Calendar</span>
      </div>

      <div className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[13px] font-bold text-[var(--text)]">This week</p>
          <span className="rounded-[var(--radius-full)] bg-[var(--primary-soft)] px-2 py-0.5 text-[11px] font-bold text-[var(--primary)]">
            {TOUR_POSTS.length} scheduled
          </span>
        </div>

        <div className="overflow-x-auto min-w-0 -mx-1 px-1 mps-scroll-x">
          <div className="grid min-w-[440px] grid-cols-7 gap-1.5 sm:min-w-0">
            {TOUR_DAYS.map((day, di) => {
              const posts = TOUR_POSTS.filter(([d]) => d === di);
              return (
                <div key={day} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-1.5">
                  <p className="mb-1 text-center text-[10px] font-bold uppercase text-[var(--text-subtle)]">{day}</p>
                  <div className="space-y-1">
                    {posts.map(([, k], i) => (
                      <div
                        key={i}
                        className="flex h-5 items-center gap-1 rounded-[6px] px-1"
                        style={{ background: `color-mix(in srgb, ${platformColor(k)} 18%, transparent)` }}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: platformColor(k) }} />
                        <span className="truncate text-[9px] font-semibold text-[var(--text-muted)]">{k}</span>
                      </div>
                    ))}
                    {posts.length === 0 && (
                      <div className="h-5 rounded-[6px] border border-dashed border-[var(--border)]" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
            <Star size={12} className="fill-current" />
          </span>
          <p className="text-[11px] font-semibold text-[var(--text-muted)]">
            AI Studio drafted <span className="text-[var(--text)]">3 posts</span> from this week&apos;s brief
          </p>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {PLATFORM_KEYS.slice(0, 8).map((k) => (
            <PlatformBadge key={k} platform={k} size={20} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

/* ─────────────────  PRODUCT SHOWCASE MOCKS  ─────────────────
   Real MultiPost Studio surfaces, illustrated with clearly-marked
   demonstration data (see <DemoNote/> rendered under each window).
   Pure divs + inline SVG — no new dependencies, no layout shift. */

export function DemoNote({ className }: { className?: string }) {
  return (
    <p className={cn("mt-3 text-center text-[12px] text-[var(--text-subtle)]", className)}>
      Product interface illustrated with demonstration data.
    </p>
  );
}

export function StudioWindow({
  title,
  right,
  children,
  className,
  label,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="img"
      aria-label={label ?? title}
      className={cn(
        "overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5 border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2 sm:px-4 sm:py-2.5">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--danger)]/50" aria-hidden />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--warning)]/50" aria-hidden />
        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-[var(--success)]/50" aria-hidden />
        <span className="ml-2 truncate text-[11px] font-semibold text-[var(--text-subtle)] sm:text-[12px]">
          {title}
        </span>
        {right && <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">{right}</span>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Pill({ tone, children }: { tone: "success" | "warning" | "info" | "danger" | "neutral"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    success: "bg-[var(--success-soft)] text-[var(--success)]",
    warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
    info: "bg-[var(--info-soft)] text-[var(--info)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    neutral: "bg-[var(--secondary-soft)] text-[var(--text-muted)]",
  };
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold", tones[tone])}>
      {children}
    </span>
  );
}

/* Full workspace: nav rail + KPIs + growth chart + up-next queue. */
const HERO_NAV = [
  { icon: LayoutDashboard, label: "Dashboard", active: true },
  { icon: CalendarDays, label: "Calendar" },
  { icon: PenSquare, label: "Composer" },
  { icon: Clock, label: "Queue" },
  { icon: Inbox, label: "Inbox", count: "12" },
  { icon: BarChart3, label: "Analytics" },
  { icon: Sparkles, label: "AI Studio" },
  { icon: BadgeCheck, label: "Approvals", count: "3" },
];

const HERO_KPIS: [string, string, string][] = [
  ["Followers", "132.5K", "+8.4%"],
  ["Engagement", "48.9K", "+12.1%"],
  ["Reach", "1.8M", "+5.2%"],
  ["Avg. ER", "4.6%", "+0.8pt"],
];

const HERO_QUEUE: { p: PlatformKey; text: string; when: string; tone: "success" | "warning" | "info"; status: string }[] = [
  { p: "instagram", text: "Launch carousel — 5 slides", when: "Tue 9:00", tone: "success", status: "Scheduled" },
  { p: "linkedin", text: "Hiring post — Design Engineer", when: "Tue 12:30", tone: "warning", status: "In review" },
  { p: "x", text: "Changelog 3.4 is live", when: "Tue 14:00", tone: "info", status: "Queuing" },
  { p: "tiktok", text: "Studio behind-the-scenes", when: "Wed 18:00", tone: "success", status: "Scheduled" },
];

export function HeroDashboard() {
  return (
    <StudioWindow
      title="MultiPost Studio · Dashboard"
      label="MultiPost Studio dashboard showing followers, engagement, reach, a growth chart and the upcoming posting queue"
      right={
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--success-soft)] px-2 py-0.5 text-[10.5px] font-bold text-[var(--success)] sm:text-[11px]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> Live sync
        </span>
      }
    >
      <div className="flex min-w-0">
        {/* nav rail */}
        <div className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-[var(--border)] bg-[var(--surface)] p-2.5 sm:flex lg:w-48" aria-hidden>
          {HERO_NAV.map((n) => (
            <span
              key={n.label}
              className={cn(
                "flex items-center gap-2 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold",
                n.active ? "bg-[var(--primary-soft)] text-[var(--text)]" : "text-[var(--text-muted)]",
              )}
            >
              <n.icon size={14} className={n.active ? "text-[var(--primary)]" : undefined} />
              <span className="truncate">{n.label}</span>
              {n.count && (
                <span className="ml-auto rounded-full bg-[var(--primary)] px-1.5 text-[10px] font-bold text-[var(--primary-text)]">
                  {n.count}
                </span>
              )}
            </span>
          ))}
          <span className="mt-auto flex items-center gap-2 rounded-[8px] bg-[var(--bg)] px-2.5 py-2">
            <Identicon name="Maya Chen" className="h-6 w-6 rounded-full" />
            <span className="truncate text-[11px] font-bold text-[var(--text)]">Acme Co</span>
          </span>
        </div>
        {/* main */}
        <div className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
            <p className="truncate text-[13px] font-bold text-[var(--text)] sm:text-[14px]">Good morning, Maya</p>
            <span className="shrink-0 rounded-full border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--text-muted)]">
              Last 30 days
            </span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 xl:grid-cols-4">
            {HERO_KPIS.map(([k, v, d]) => (
              <div key={k} className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
                <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">{k}</p>
                <p className="mps-metric mt-0.5 truncate text-[17px] text-[var(--text)] sm:text-[19px]">{v}</p>
                <p className="text-[11px] font-bold text-[var(--success)]">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[1.5fr_1fr]">
            <div className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="truncate text-[12px] font-bold text-[var(--text-muted)]">Audience growth</p>
                <span className="shrink-0 text-[11px] font-bold text-[var(--primary)]">+2.4k this week</span>
              </div>
              <MiniArea />
            </div>
            <div className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
              <p className="mb-2 text-[12px] font-bold text-[var(--text-muted)]">Up next</p>
              <div className="space-y-1.5">
                {HERO_QUEUE.map((q) => (
                  <div key={q.text} className="flex min-w-0 items-center gap-2">
                    <PlatformBadge platform={q.p} size={22} className="rounded-[6px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11.5px] font-semibold text-[var(--text)]">{q.text}</p>
                      <p className="text-[10.5px] text-[var(--text-subtle)]">{q.when}</p>
                    </div>
                    <Pill tone={q.tone}>{q.status}</Pill>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </StudioWindow>
  );
}

/* Composer: per-channel tabs with character counts, draft, media, score. */
const COMPOSER_TABS: { p: PlatformKey; count: string; max: number; used: number }[] = [
  { p: "instagram", count: "1,842 / 2,200", max: 2200, used: 1842 },
  { p: "linkedin", count: "1,204 / 3,000", max: 3000, used: 1204 },
  { p: "x", count: "242 / 280", max: 280, used: 242 },
  { p: "threads", count: "318 / 500", max: 500, used: 318 },
];

export function ComposerMock() {
  return (
    <StudioWindow
      title="MultiPost Studio · Composer"
      label="Post composer with per-platform variants, character counts, attached media and a pre-publish content score"
      right={<Pill tone="success">Score 92 · Ready</Pill>}
    >
      <div className="p-3 sm:p-4">
        <div className="mps-scroll-x -mx-1 overflow-x-auto px-1">
          <div className="flex min-w-max gap-1.5">
            {COMPOSER_TABS.map((t, i) => (
              <span
                key={t.p}
                className={cn(
                  "flex items-center gap-1.5 rounded-[8px] border px-2.5 py-1.5 text-[11px] font-bold",
                  i === 0
                    ? "border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] bg-[var(--primary-soft)] text-[var(--text)]"
                    : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]",
                )}
              >
                <PlatformBadge platform={t.p} size={16} className="rounded-[4px]" />
                {t.count}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
          <p className="text-[12.5px] font-bold leading-snug text-[var(--text)]">
            5 scheduling mistakes quietly killing your reach
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Mistake #1: posting when <em>you&apos;re</em> online instead of when your audience is. Your queue
            should follow your engagement data — not your calendar…
          </p>
          <div className="mt-2.5 flex items-center gap-2.5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gradient-brand)] text-white" aria-hidden>
              <ImagePlus size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11.5px] font-bold text-[var(--text)]">launch-carousel-03.png</p>
              <p className="text-[10.5px] text-[var(--text-subtle)]">1080 × 1350 · 412 KB</p>
            </div>
            <span className="ml-auto shrink-0 text-[10.5px] font-bold text-[var(--primary)]">+4</span>
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Pill tone="neutral">
            <MessageCircle size={11} /> First comment on
          </Pill>
          <Pill tone="neutral">
            <Link2 size={11} /> UTM tagged
          </Pill>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--primary)] px-3 py-1.5 text-[11px] font-bold text-[var(--primary-text)]">
            <Send size={11} /> Schedule · Tue 9:00
          </span>
        </div>
      </div>
    </StudioWindow>
  );
}

/* Publishing queue: per-channel timing, statuses, automatic retry. */
const QUEUE_ROWS: { p: PlatformKey; text: string; when: string; tone: "success" | "warning" | "info" | "danger"; status: string }[] = [
  { p: "instagram", text: "Launch carousel — 5 slides + first comment", when: "Tue 9:00 · Queue A", tone: "success", status: "Scheduled" },
  { p: "linkedin", text: "Hiring post — Design Engineer role", when: "Tue 12:30 · Queue B", tone: "warning", status: "Awaiting approval" },
  { p: "x", text: "Changelog 3.4 is live — 3 highlights", when: "Tue 14:00 · Queue A", tone: "info", status: "Publishing…" },
  { p: "tiktok", text: "Studio behind-the-scenes — 24s cut", when: "Wed 18:00 · Queue C", tone: "success", status: "Scheduled" },
  { p: "youtube", text: "Q3 recap — description + chapters set", when: "Thu 10:00 · Queue A", tone: "danger", status: "Failed · retry 2/5" },
];

export function QueueMock() {
  return (
    <StudioWindow
      title="MultiPost Studio · Publishing queue"
      label="Publishing queue with per-channel slots, live statuses and an automatic retry on a failed post"
      right={<Pill tone="neutral">5 slots this week</Pill>}
    >
      <div className="space-y-1.5 p-3 sm:p-4">
        {QUEUE_ROWS.map((q) => (
          <div
            key={q.text}
            className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2"
          >
            <PlatformBadge platform={q.p} size={26} className="rounded-[7px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12px] font-semibold text-[var(--text)]">{q.text}</p>
              <p className="truncate text-[10.5px] text-[var(--text-subtle)]">{q.when}</p>
            </div>
            <Pill tone={q.tone}>{q.status}</Pill>
          </div>
        ))}
        <p className="flex items-center gap-1.5 px-1 pt-1 text-[11px] font-semibold text-[var(--text-subtle)]">
          <Clock size={12} className="text-[var(--success)]" />
          Failed posts retry automatically — you only step in when it truly needs a human.
        </p>
      </div>
    </StudioWindow>
  );
}

/* Unified inbox: sentiment, priority, one-click AI reply. */
const INBOX_ROWS: { name: string; p: PlatformKey; text: string; when: string; sentiment: string; priority?: string }[] = [
  { name: "Maya R.", p: "instagram", text: "Love this breakdown! Do you support first comments too?", when: "2m", sentiment: "var(--success)", priority: "High" },
  { name: "Dan K.", p: "x", text: "Is there a free plan for a solo creator?", when: "18m", sentiment: "var(--info)" },
  { name: "Priya S.", p: "linkedin", text: "The approval flow post was exactly our problem.", when: "1h", sentiment: "var(--success)" },
  { name: "Leo M.", p: "tiktok", text: "Video didn't load the captions on my device", when: "3h", sentiment: "var(--warning)", priority: "High" },
];

export function InboxMock() {
  return (
    <StudioWindow
      title="MultiPost Studio · Inbox"
      label="Unified social inbox with sentiment, priority and a suggested AI reply"
      right={<Pill tone="warning">2 need replies</Pill>}
    >
      <div className="p-3 sm:p-4">
        <div className="space-y-1.5">
          {INBOX_ROWS.map((m) => (
            <div
              key={m.name + m.text}
              className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2"
            >
              <span className="relative shrink-0">
                <Identicon name={m.name} className="h-8 w-8 rounded-full" />
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--surface)]" style={{ background: m.sentiment }} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-[var(--text)]">
                  <span className="truncate">{m.name}</span>
                  <PlatformBadge platform={m.p} size={14} className="rounded-[4px]" />
                  {m.priority && <span className="shrink-0 text-[10px] font-bold text-[var(--warning)]">· {m.priority}</span>}
                </p>
                <p className="truncate text-[11.5px] text-[var(--text-muted)]">{m.text}</p>
              </div>
              <span className="shrink-0 text-[10.5px] font-semibold text-[var(--text-subtle)]">{m.when}</span>
            </div>
          ))}
        </div>
        <div className="mt-2.5 rounded-[10px] border border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--text)]">
            <Sparkles size={12} className="text-[var(--primary)]" /> Suggested reply — in your brand voice
          </p>
          <p className="mt-1 text-[12px] leading-relaxed text-[var(--text-muted)]">
            “Thanks Maya! Yes — first comments go out automatically with every Instagram post…”
          </p>
          <div className="mt-2 flex gap-1.5">
            <span className="rounded-full bg-[var(--primary)] px-3 py-1 text-[11px] font-bold text-[var(--primary-text)]">Use reply</span>
            <span className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-[11px] font-bold text-[var(--text-muted)]">Shorten</span>
            <span className="rounded-full border border-[var(--border-strong)] px-3 py-1 text-[11px] font-bold text-[var(--text-muted)]">Discard</span>
          </div>
        </div>
      </div>
    </StudioWindow>
  );
}

/* Analytics: date range, KPI rollups, growth chart, platform split, insight. */
const ANALYTICS_BARS: { p: PlatformKey; label: string; pct: number; delta: string }[] = [
  { p: "instagram", label: "Instagram", pct: 82, delta: "+14%" },
  { p: "tiktok", label: "TikTok", pct: 64, delta: "+9%" },
  { p: "youtube", label: "YouTube", pct: 58, delta: "+6%" },
  { p: "linkedin", label: "LinkedIn", pct: 51, delta: "+11%" },
  { p: "x", label: "X", pct: 38, delta: "+3%" },
  { p: "facebook", label: "Facebook", pct: 33, delta: "+2%" },
];

export function AnalyticsMock() {
  return (
    <StudioWindow
      title="MultiPost Studio · Analytics"
      label="Analytics dashboard with reach, engagement, follower growth, per-platform performance and a written insight"
      right={
        <span className="rounded-full border border-[var(--border)] px-2.5 py-1 text-[10.5px] font-bold text-[var(--text-muted)]">
          Last 30 days · All channels
        </span>
      }
    >
      <div className="p-3 sm:p-5">
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[
            ["Reach", "1.8M", "+12.4%"],
            ["Engagement", "48.9K", "+8.1%"],
            ["New followers", "+6.2K", "+4.3%"],
            ["Link clicks", "21.4K", "+19.0%"],
          ].map(([k, v, d]) => (
            <div key={k} className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5 sm:p-3">
              <p className="truncate text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">{k}</p>
              <p className="mps-metric mt-0.5 truncate text-[19px] text-[var(--text)] sm:text-[22px]">{v}</p>
              <p className="text-[11px] font-bold text-[var(--success)]">{d} vs prior</p>
            </div>
          ))}
        </div>
        <div className="mt-2 grid min-w-0 grid-cols-1 gap-2 lg:grid-cols-[1.4fr_1fr]">
          <div className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
            <p className="mb-1 text-[12px] font-bold text-[var(--text-muted)]">Engagement trend</p>
            <div className="h-[110px] sm:h-[132px]">
              <MiniArea />
            </div>
          </div>
          <div className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3 sm:p-4">
            <p className="mb-2 text-[12px] font-bold text-[var(--text-muted)]">Per-platform performance</p>
            <div className="space-y-2">
              {ANALYTICS_BARS.map((b) => (
                <div key={b.p} className="flex min-w-0 items-center gap-2">
                  <PlatformBadge platform={b.p} size={18} className="rounded-[5px]" />
                  <span className="w-20 shrink-0 truncate text-[11px] font-semibold text-[var(--text-muted)]">{b.label}</span>
                  <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                    <span className="block h-full rounded-full bg-[var(--gradient-brand)]" style={{ width: `${b.pct}%` }} />
                  </span>
                  <span className="w-10 shrink-0 text-right text-[10.5px] font-bold text-[var(--success)]">{b.delta}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-2 flex min-w-0 items-start gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]" aria-hidden>
            <Sparkles size={14} />
          </span>
          <p className="min-w-0 text-[12px] leading-relaxed text-[var(--text-muted)]">
            <span className="font-bold text-[var(--text)]">Insight:</span> educational carousels earn 42% more
            saves than average — shifting two weekly slots toward them is projected to lift reach 9%.
          </p>
        </div>
      </div>
    </StudioWindow>
  );
}

/* AI Studio: prompt → ideas → platform variants → score → schedule. */
export function AiFlowMock() {
  return (
    <StudioWindow
      title="MultiPost Studio · AI Studio"
      label="AI Studio turning a campaign prompt into ideas, captions, platform variants and scheduled posts"
      right={<Pill tone="neutral">Brand Brain · On</Pill>}
    >
      <div className="space-y-2.5 p-3 sm:p-4">
        <div className="ml-auto w-fit max-w-[92%] rounded-[12px] rounded-br-[4px] bg-[var(--primary)] px-3 py-2 text-[12px] font-semibold leading-relaxed text-[var(--primary-text)]">
          Create a 7-day Instagram launch campaign for the Pro plan — bold tone.
        </div>
        <div className="grid gap-1.5 sm:grid-cols-3">
          {["“The queue that never sleeps”", "“5 posts in, 0 tabs open”", "“Your best post, on repeat”"].map((h, i) => (
            <div key={h} className="min-w-0 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-subtle)]">Hook {i + 1}</p>
              <p className="mt-0.5 truncate text-[12px] font-bold text-[var(--text)]">{h}</p>
            </div>
          ))}
        </div>
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["instagram", "linkedin", "x"] as PlatformKey[]).map((p, i) => (
              <span
                key={p}
                className={cn(
                  "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                  i === 0 ? "bg-[var(--primary-soft)] text-[var(--text)]" : "text-[var(--text-subtle)]",
                )}
              >
                <PlatformBadge platform={p} size={14} className="rounded-[4px]" />
                {PLATFORMS[p].label}
              </span>
            ))}
            <span className="ml-auto shrink-0 text-[11px] font-bold text-[var(--success)]">Score 94</span>
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--text-muted)]">
            Five scheduling mistakes quietly killing your reach — and the queue setup that fixes all five.
            #SocialMediaTips #ContentStrategy
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Pill tone="success">
            <Check size={11} /> 7 posts drafted
          </Pill>
          <Pill tone="success">
            <Check size={11} /> Variants per platform
          </Pill>
          <Pill tone="info">
            <Clock size={11} /> Slotted into queue
          </Pill>
        </div>
      </div>
    </StudioWindow>
  );
}

/* Approvals: draft → review → approved → scheduled, frozen versions. */
const APPROVAL_STAGES: { label: string; who: string; when: string; state: "done" | "current" | "todo"; note: string }[] = [
  { label: "Draft", who: "Maya · Creator", when: "Mon 10:24", state: "done", note: "v3 submitted for review" },
  { label: "In review", who: "Daniel · Editor", when: "Now", state: "current", note: "2 comments — caption tweak" },
  { label: "Approved", who: "Priya · Manager", when: "Pending", state: "todo", note: "Version freezes on sign-off" },
  { label: "Scheduled", who: "Auto · Queue A", when: "Tue 9:00", state: "todo", note: "No silent edits after approval" },
];

export function ApprovalsMock() {
  return (
    <StudioWindow
      title="MultiPost Studio · Approvals"
      label="Approval chain showing draft, review, approval and scheduling stages with team roles"
      right={<Pill tone="warning">Awaiting review</Pill>}
    >
      <div className="p-3 sm:p-4">
        <div className="flex min-w-0 items-center gap-2.5 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[8px] bg-[var(--gradient-brand)] text-white" aria-hidden>
            <ImagePlus size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-bold text-[var(--text)]">Pro launch — carousel + caption v3</p>
            <p className="truncate text-[11px] text-[var(--text-subtle)]">4 platforms · first comment attached</p>
          </div>
          <PlatformBadge platform="instagram" size={22} className="rounded-[6px]" />
        </div>
        <ol className="mt-3 space-y-0">
          {APPROVAL_STAGES.map((s, i) => (
            <li key={s.label} className="relative flex gap-3 pb-4 last:pb-0">
              {i < APPROVAL_STAGES.length - 1 && (
                <span
                  aria-hidden
                  className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-px bg-[var(--border-strong)]"
                />
              )}
              <span
                className={cn(
                  "z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[12px] font-extrabold",
                  s.state === "done" && "border-transparent bg-[var(--success)] text-white",
                  s.state === "current" && "border-transparent bg-[var(--primary)] text-[var(--primary-text)]",
                  s.state === "todo" && "border-[var(--border-strong)] bg-[var(--surface)] text-[var(--text-subtle)]",
                )}
                aria-hidden
              >
                {s.state === "done" ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 rounded-[10px] border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
                <p className="flex flex-wrap items-center gap-x-2 text-[12px] font-bold text-[var(--text)]">
                  {s.label}
                  <span className="text-[11px] font-semibold text-[var(--text-subtle)]">{s.who}</span>
                  <span className="ml-auto text-[10.5px] font-semibold text-[var(--text-subtle)]">{s.when}</span>
                </p>
                <p className="truncate text-[11px] text-[var(--text-muted)]">{s.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </StudioWindow>
  );
}
