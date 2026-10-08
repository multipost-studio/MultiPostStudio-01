import * as React from "react";
import { PlatformBadge } from "@/components/brand";
import { PLATFORM_KEYS, type PlatformKey } from "@/lib/constants";

/**
 * Shared hero effects. Server components, CSS-only motion (see `.mps-hx*` in
 * globals.css), so they cost no JS, never block hydration and stop under
 * prefers-reduced-motion. All of it is aria-hidden decoration.
 */

/** Drifting colour mesh, dotted grid and light sweeps behind a hero. */
export function HeroBackdrop({ compact = false }: { compact?: boolean }) {
  return (
    <div aria-hidden className={`mps-hx-bg ${compact ? "mps-hx-bg--compact" : ""}`}>
      <span className="mps-hx-blob mps-hx-blob--a" />
      <span className="mps-hx-blob mps-hx-blob--b" />
      <span className="mps-hx-blob mps-hx-blob--c" />
      <span className="mps-hx-grid" />
      {!compact && (
        <>
          <span className="mps-hx-beam mps-hx-beam--a" />
          <span className="mps-hx-beam mps-hx-beam--b" />
        </>
      )}
    </div>
  );
}

/** Soft banner wash for article-style pages (legal, tools, posts). Put it as
 *  the first child of a `relative isolate` container. */
export function ArticleBackdrop() {
  return (
    <div aria-hidden className="mps-hx-article">
      <HeroBackdrop compact />
    </div>
  );
}

const SLOTS =["l1", "l2", "l3", "r1", "r2", "r3"] as const;

function seedOf(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

/** Six network badges bobbing at the edges of a wide hero. Which six, and in
 *  which order, depends on `seed` so neighbouring pages don't look identical. */
export function HeroBadges({ seed = "" }: { seed?: string }) {
  const start = seedOf(seed) % PLATFORM_KEYS.length;
  const keys: PlatformKey[] = SLOTS.map((_, i) => PLATFORM_KEYS[(start + i * 2) % PLATFORM_KEYS.length]);
  return (
    <div aria-hidden className="mps-hx-badges">
      {SLOTS.map((slot, i) => (
        <span key={slot} className={`mps-hx-badge mps-hx-badge--${slot}`}>
          <PlatformBadge platform={keys[i]} size={44} className="rounded-[14px]" />
        </span>
      ))}
    </div>
  );
}

/** Last word of a plain-text title picks up the animated brand gradient and a
 *  hand-drawn underline. The text content is unchanged, so SEO and screen
 *  readers see exactly the same heading. Non-string titles pass through. */
export function AccentTitle({ title }: { title: React.ReactNode }) {
  if (typeof title !== "string") return <>{title}</>;
  const trimmed = title.trim();
  const cut = trimmed.lastIndexOf(" ");
  if (cut < 0) return <AccentWord word={trimmed} />;
  return (
    <>
      {trimmed.slice(0, cut + 1)}
      <AccentWord word={trimmed.slice(cut + 1)} />
    </>
  );
}

/** `suffix` (e.g. a comma) sits inside the no-wrap box so it can never be orphaned onto the next line. */
export function AccentWord({ word, suffix }: { word: string; suffix?: string }) {
  return (
    <span className="mps-hx-word">
      <span className="mps-hx-word__in">
        <em className="mps-hx-accent">{word}</em>
        <svg aria-hidden className="mps-hx-underline" viewBox="0 0 220 14" preserveAspectRatio="none" fill="none">
          <path pathLength={1} d="M3 9C40 2 80 13 118 6S190 3 217 8" />
        </svg>
      </span>
      {suffix}
    </span>
  );
}

const STAGES = ["Plan", "Create", "Schedule", "Publish", "Engage", "Analyze"] as const;

/** The six stages of the workflow lighting up in turn. */
export function StageChips() {
  return (
    <ol className="mps-hx-stages" aria-label="Plan, create, schedule, publish, engage, analyze">
      {STAGES.map((s, i) => (
        <li key={s} aria-hidden style={{ "--i": i } as React.CSSProperties}>
          <span className="mps-hx-stage-dot" />
          {s}
        </li>
      ))}
    </ol>
  );
}
