"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  CalendarDays,
  Compass,
  LifeBuoy,
  Link2,
  Plus,
  Volume2,
  VolumeX,
  EyeOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSISTANT_ACTIONS } from "./mascot-config";
import type { AssistantIcon } from "./mascot-types";

const ICONS: Record<AssistantIcon, React.ComponentType<{ size?: number | string; "aria-hidden"?: boolean | "true" | "false" }>> = {
  create: Plus,
  calendar: CalendarDays,
  connect: Link2,
  analytics: BarChart3,
  tour: Compass,
  help: LifeBuoy,
};

/**
 * Compact "MultiPost Assistant" popover. Mirrors the project's Dropdown
 * patterns: outside-click + Escape to close, focus moved in on open and
 * returned to the companion on close, `role="dialog"` semantics.
 */
export function MascotAssistant({
  onClose,
  onStartTour,
  returnFocus,
  muted,
  onToggleMute,
  onHide,
}: {
  onClose: () => void;
  onStartTour: () => void;
  /** Focus the companion trigger when the panel closes. */
  returnFocus: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onHide: () => void;
}) {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onPointer = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        returnFocus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey, true);
    // Move focus to the first action for keyboard users.
    panelRef.current?.querySelector<HTMLElement>("button:not([aria-label]), a[href]")?.focus();
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [onClose, returnFocus]);

  const closeAndReturn = React.useCallback(() => {
    onClose();
    returnFocus();
  }, [onClose, returnFocus]);

  return (
    <motion.div
      ref={panelRef}
      role="dialog"
      aria-label="MultiPost Assistant"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.97 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className={cn(
        "pointer-events-auto w-[min(320px,calc(100vw-2.5rem))]",
        "rounded-[var(--radius-lg)] border border-[var(--border-strong)]",
        "bg-[var(--bg-elevated)] shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2 border-b border-[var(--border)] px-4 pb-3 pt-3.5">
        <div>
          <p className="text-[15px] font-bold text-[var(--text)]">MultiPost Assistant</p>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Hi! How can I help?</p>
        </div>
        <button
          type="button"
          onClick={closeAndReturn}
          aria-label="Close assistant"
          className="shrink-0 rounded-[var(--radius-sm)] p-1.5 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <ul className="max-h-[min(46dvh,360px)] overflow-y-auto p-1.5">
        {ASSISTANT_ACTIONS.map((action) => {
          const Icon = ICONS[action.icon];
          const row = cn(
            "flex w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-left",
            "hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
          );
          const content = (
            <>
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--primary-soft)] text-[var(--primary)]"
              >
                <Icon size={16} />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-[var(--text)]">
                  {action.label}
                </span>
                <span className="block truncate text-[12.5px] text-[var(--text-muted)]">
                  {action.description}
                </span>
              </span>
            </>
          );
          return (
            <li key={action.label}>
              {action.tour ? (
                <button type="button" onClick={() => { onClose(); onStartTour(); }} className={row}>
                  {content}
                </button>
              ) : (
                <a
                  href={action.href}
                  onClick={(e) => {
                    // Client-side navigation keeps the SPA shell alive.
                    e.preventDefault();
                    onClose();
                    if (action.href) router.push(action.href);
                  }}
                  className={cn(row, "block")}
                >
                  {content}
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-1 border-t border-[var(--border)] px-2 py-1.5">
        <button
          type="button"
          onClick={onToggleMute}
          aria-pressed={muted}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          {muted ? <VolumeX size={13} aria-hidden /> : <Volume2 size={13} aria-hidden />}
          {muted ? "Unmute hints" : "Mute hints"}
        </button>
        <button
          type="button"
          onClick={onHide}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <EyeOff size={13} aria-hidden />
          Hide companion
        </button>
      </div>
    </motion.div>
  );
}
