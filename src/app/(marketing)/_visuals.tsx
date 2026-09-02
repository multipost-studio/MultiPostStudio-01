"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import { Heart, MessageCircle, Repeat2, Bookmark, Star, Check } from "lucide-react";
import { LogoMark, PlatformBadge } from "@/components/brand";
import { PLATFORM_KEYS } from "@/lib/constants";
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

const STACK_LABELS = ["Maya · Editor", "Leo · Creator", "Avery · Manager", "Dana · Client", "Sam · Analyst"];

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
            <span className="absolute bottom-2 left-2 rounded-full bg-[var(--primary)] px-2 py-0.5 text-[11px] font-bold text-white">
              {label}
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ────────────────────────  LOGO CLOUD  ─────────────────────── */

const LOGOS = ["Northwind", "Alpine", "Fitwave", "Loopcraft", "Brightwave", "Emberline", "Studio Nova"];

export function LogoCloud({ label = "Trusted by teams at" }: { label?: string }) {
  return (
    <div className="mx-auto max-w-4xl px-5 py-2 text-center">
      <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[var(--text-subtle)]">{label}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
        {LOGOS.map((l) => (
          <span key={l} className="text-[17px] font-extrabold tracking-tight text-[var(--text-subtle)] opacity-70">
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────  RATING CHIP  ────────────────────── */

export function RatingChip({
  score = "4.9",
  count = "25,000+ reviews",
}: {
  score?: string;
  count?: string;
}) {
  return (
    <div className="inline-flex items-center gap-3 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] py-1.5 pl-2 pr-4 shadow-sm">
      <div className="flex -space-x-2">
        {["Maya Ree", "Leo Vance", "Ada Kim", "Sam Orr"].map((n) => (
          <Identicon
            key={n}
            name={n}
            className="h-6 w-6 rounded-full border-2 border-[var(--bg-elevated)] text-[8px]"
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <Star key={i} size={13} className="fill-[var(--warning)] text-[var(--warning)]" />
        ))}
      </div>
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

/* ───────────────────────  MINI CHARTS  ─────────────────────── */

const areaData = Array.from({ length: 14 }, (_, i) => ({ v: 20 + Math.round(seededRandom("a" + i) * 60) + i * 3 }));
const barData = Array.from({ length: 6 }, (_, i) => ({ v: 15 + Math.round(seededRandom("b" + i) * 55) }));
const pieData = [
  { name: "Positive", value: 72, c: "var(--success)" },
  { name: "Neutral", value: 20, c: "var(--warning)" },
  { name: "Negative", value: 8, c: "var(--primary)" },
];

export function MiniArea() {
  return (
    <ResponsiveContainer width="100%" height={88}>
      <AreaChart data={areaData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="ma" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke="var(--primary)" strokeWidth={2} fill="url(#ma)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function MiniBars() {
  return (
    <ResponsiveContainer width="100%" height={88}>
      <BarChart data={barData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="v" radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false}>
          {barData.map((_, i) => (
            <Cell key={i} fill={["var(--primary)", "var(--accent)", "var(--info)", "var(--success)", "var(--warning)", "var(--primary)"][i]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MiniDonut() {
  return (
    <div className="relative h-[88px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={pieData}
            dataKey="value"
            cx="50%"
            cy="50%"
            innerRadius={28}
            outerRadius={42}
            paddingAngle={2}
            stroke="none"
            isAnimationActive={false}
          >
            {pieData.map((d, i) => (
              <Cell key={i} fill={d.c} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[14px] font-extrabold text-[var(--text)]">72%</span>
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
      whileHover={reduce ? undefined : { y: -6 }}
      className="relative w-full max-w-2xl overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--primary)]/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--warning)]/50" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--success)]/50" />
        <span className="ml-3 text-[12px] font-semibold text-[var(--text-subtle)]">MultiPost Studio · Analytics</span>
      </div>
      <div className="p-4">
        <div className="grid grid-cols-4 gap-2">
          {[
            ["Followers", "132.5K", "+8.4%"],
            ["Engagement", "48.9K", "+12%"],
            ["Reach", "1.8M", "+5%"],
            ["Impressions", "3.2M", "+9%"],
          ].map(([k, v, d]) => (
            <div key={k} className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
              <p className="text-[9px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{k}</p>
              <p className="text-[16px] font-extrabold text-[var(--text)]">{v}</p>
              <p className="text-[11px] font-bold text-[var(--success)]">{d}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-[1.6fr_1fr] gap-2">
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
            <p className="mb-1 text-[11px] font-bold text-[var(--text-muted)]">Audience growth</p>
            <MiniArea />
          </div>
          <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-2.5">
            <p className="mb-1 text-[11px] font-bold text-[var(--text-muted)]">Sentiment</p>
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
