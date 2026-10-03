"use client";

import * as React from "react";
import MatrixOrb, { type MatrixOrbState } from "@/components/ui/matrix-orb";
import { cn } from "@/lib/utils";

export type AppLoaderVariant =
  | "fullscreen"
  | "page"
  | "section"
  | "modal"
  | "action"
  | "table";

export type AppLoaderSize = "sm" | "md" | "lg" | number;

export interface AppLoaderProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Visual presentation style */
  variant?: AppLoaderVariant;
  /** Matrix orb size preset or exact pixel diameter */
  size?: AppLoaderSize;
  /** Orb animation state: "thinking" (processing), "listening" (awaiting input), or "idle" */
  state?: MatrixOrbState;
  /** Primary loading message */
  text?: React.ReactNode;
  /** Secondary contextual description */
  subtext?: React.ReactNode;
  /** Dot matrix color override (defaults to theme primary #F0762E) */
  color?: string;
  /** Dot density in the matrix */
  dots?: number;
  /** Optional audio/intensity level driver (0 to 1) */
  level?: number;
}

const DEFAULT_SIZES: Record<AppLoaderVariant, number> = {
  fullscreen: 180,
  page: 160,
  section: 120,
  modal: 100,
  table: 110,
  action: 48,
};

const SIZE_PRESETS: Record<"sm" | "md" | "lg", number> = {
  sm: 64,
  md: 120,
  lg: 180,
};

function resolveSize(size: AppLoaderSize | undefined, variant: AppLoaderVariant): number {
  if (typeof size === "number") return size;
  if (size && size in SIZE_PRESETS) return SIZE_PRESETS[size as "sm" | "md" | "lg"];
  return DEFAULT_SIZES[variant];
}

function resolveDots(size: number): number {
  if (size <= 56) return 9;
  if (size <= 140) return 11;
  return 13;
}

/**
 * AppLoader — Centralized, premium loading state powered by Matrix Orb.
 *
 * Provides responsive, accessible, theme-aligned feedback for page transitions,
 * AI processing, file imports, background synchronizations, and modals.
 */
export function AppLoader({
  variant = "page",
  size,
  state = "thinking",
  text = "Loading…",
  subtext,
  color = "#F0762E",
  dots,
  level,
  className,
  children,
  ...props
}: AppLoaderProps) {
  const resolvedSize = resolveSize(size, variant);
  const resolvedDots = dots ?? resolveDots(resolvedSize);

  // Compact action variant (inline horizontal layout)
  if (variant === "action") {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn("inline-flex items-center gap-2.5 text-left select-none", className)}
        {...props}
      >
        <MatrixOrb
          size={resolvedSize}
          state={state}
          dots={resolvedDots}
          color={color}
          level={level}
          showLabel={false}
          className="shrink-0"
        />
        {(text || subtext) && (
          <div className="flex flex-col">
            {text && (
              <span className="text-[13px] font-medium text-[var(--text)]">
                {text}
              </span>
            )}
            {subtext && (
              <span className="text-[11px] text-[var(--text-subtle)]">
                {subtext}
              </span>
            )}
          </div>
        )}
      </div>
    );
  }

  // Variant container wrappers
  const containerClasses: Record<AppLoaderVariant, string> = {
    fullscreen:
      "fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg)]/90 backdrop-blur-md p-6 text-center select-none animate-in fade-in-0 duration-200",
    page:
      "flex min-h-[50vh] w-full flex-col items-center justify-center p-6 text-center select-none",
    section:
      "flex w-full flex-col items-center justify-center py-12 px-4 text-center select-none",
    modal:
      "flex w-full flex-col items-center justify-center py-8 px-4 text-center select-none",
    table:
      "flex min-h-[280px] w-full flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-8 text-center select-none",
    action: "",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(containerClasses[variant], className)}
      {...props}
    >
      <div className="flex flex-col items-center justify-center">
        <MatrixOrb
          size={resolvedSize}
          state={state}
          dots={resolvedDots}
          color={color}
          level={level}
          showLabel={false}
          className="transition-transform duration-300"
        />

        {(text || subtext) && (
          <div className="mt-4 max-w-sm space-y-1">
            {text && (
              <h4 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">
                {text}
              </h4>
            )}
            {subtext && (
              <p className="text-[12.5px] leading-relaxed text-[var(--text-muted)]">
                {subtext}
              </p>
            )}
          </div>
        )}

        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}

export default AppLoader;
