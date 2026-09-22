"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import {
  BarChart3,
  CalendarDays,
  Check,
  Circle,
  Compass,
  LifeBuoy,
  Link2,
  Plus,
  Volume2,
  VolumeX,
  EyeOff,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ASSISTANT_ACTIONS } from "./mascot-config";
import type { AssistantAction, AssistantIcon, ChecklistItem } from "./mascot-types";

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
  contextAction,
  checklist,
  vibe,
  onToggleVibe,
}: {
  onClose: () => void;
  onStartTour: () => void;
  /** Focus the companion trigger when the panel closes. */
  returnFocus: () => void;
  muted: boolean;
  onToggleMute: () => void;
  onHide: () => void;
  /** Page-aware lead action ("Suggested for this page"). Null hides the slot. */
  contextAction?: AssistantAction | null;
  /** "Getting started" progress. Section hides itself once all complete. */
  checklist?: ChecklistItem[] | null;
  vibe: "calm" | "hype";
  onToggleVibe: () => void;
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

  const go = React.useCallback(
    (href: string) => {
      // Client-side navigation keeps the SPA shell alive.
      onClose();
      router.push(href);
    },
    [onClose, router],
  );

  const renderRow = (action: AssistantAction, suggested: boolean) => {
    const Icon = ICONS[action.icon];
    const row = cn(
      "flex w-full items-center gap-3 rounded-[var(--radius)] px-2.5 py-2 text-left",
      "hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
      suggested && "bg-[var(--primary-soft)] hover:bg-[var(--primary-soft)]",
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
            {suggested ? "Suggested for this page" : action.description}
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
              e.preventDefault();
              if (action.href) go(action.href);
            }}
            className={cn(row, "block")}
          >
            {content}
          </a>
        )}
      </li>
    );
  };

  // The suggestion duplicates a standard row when hrefs match — show it once.
  const rest = contextAction?.href
    ? ASSISTANT_ACTIONS.filter((a) => a.href !== contextAction.href)
    : ASSISTANT_ACTIONS;

  // Checklist progress: hidden entirely once everything is done.
  const open = checklist?.filter((c) => !c.done) ?? [];

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
        {open.length > 0 && (
          <li aria-label="Getting started checklist" className="mb-1 rounded-[var(--radius)] bg-[var(--surface-hover)] px-2.5 py-2">
            <p className="px-0.5 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-subtle)]">
              Getting started · {open.length === 1 ? "1 step left" : `${(checklist?.length ?? 0) - open.length}/${checklist?.length ?? 0} done`}
            </p>
            <ul className="mt-1 space-y-0.5">
              {checklist!.map((c) => (
                <li key={c.label}>
                  <a
                    href={c.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(c.href);
                    }}
                    className="flex items-center gap-2 rounded-[var(--radius-sm)] px-0.5 py-1 text-left focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  >
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                        c.done ? "bg-[var(--success)] text-white" : "border border-[var(--border-strong)] text-transparent",
                      )}
                    >
                      <Check size={12} strokeWidth={3} />
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", c.done ? "text-[var(--text-subtle)] line-through" : "font-medium text-[var(--text)]")}>
                      {c.label}
                    </span>
                    {!c.done && <Circle size={6} aria-hidden className="shrink-0 fill-[var(--accent)] text-[var(--accent)]" />}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        )}
        {contextAction?.href ? renderRow(contextAction, true) : null}
        {rest.map((action) => renderRow({ ...action }, false))}
      </ul>

      <div className="flex items-center gap-1 border-t border-[var(--border)] px-2 py-1.5">
        <button
          type="button"
          onClick={onToggleVibe}
          aria-pressed={vibe === "hype"}
          title={vibe === "hype" ? "Switch to calm companion" : "Switch to hype companion"}
          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1.5 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <Zap size={13} aria-hidden className={vibe === "hype" ? "fill-[var(--accent)] text-[var(--accent)]" : undefined} />
          {vibe === "hype" ? "Hype on" : "Hype mode"}
        </button>
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
