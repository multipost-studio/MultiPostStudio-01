"use client";

import * as React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MascotMessage } from "./mascot-types";

const TONE_DOT: Record<string, string> = {
  default: "bg-[var(--accent)]",
  success: "bg-[var(--success)]",
  error: "bg-[var(--danger)]",
  info: "bg-[var(--info)]",
  warning: "bg-[var(--warning)]",
};

/**
 * Small speech bubble shown above the companion. `role="status"` announces
 * politely without interrupting screen-reader users; the cooldown system
 * keeps announcements rare.
 */
export function MascotBubble({
  message,
  onClose,
  onTourAction,
  onAct,
  onSnooze,
}: {
  message: MascotMessage;
  onClose: () => void;
  /** Fired by the "Show me around" button when message.actionTour is set. */
  onTourAction?: () => void;
  /** Fired when the message's action link is followed (so the brain can learn it was useful). */
  onAct?: () => void;
  /** "Later": quiet this insight for a while. Only offered on brain messages. */
  onSnooze?: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const tone = message.tone ?? "default";

  return (
    <motion.div
      role="status"
      initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.96 }}
      animate={reduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 30 }}
      className={cn(
        "pointer-events-auto w-[min(300px,calc(100vw-5.5rem))]",
        "rounded-[var(--radius-lg)] border border-[var(--border-strong)]",
        "bg-[var(--bg-elevated)] p-3.5 shadow-lg",
      )}
    >
      <div className="flex items-start gap-2.5">
        <span aria-hidden className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[tone])} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold leading-snug text-[var(--text)]">{message.title}</p>
          {message.body && (
            <p className="mt-0.5 text-[13px] leading-snug text-[var(--text-muted)]">{message.body}</p>
          )}
          {message.actionTour && onTourAction ? (
            <button
              type="button"
              onClick={onTourAction}
              className="mt-1.5 inline-flex text-[13px] font-semibold text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              Show me around
            </button>
          ) : (
            message.actionLabel &&
            message.actionHref && (
              <span className="mt-1.5 flex items-center gap-3">
                <Link
                  href={message.actionHref}
                  onClick={onAct}
                  className="inline-flex text-[13px] font-semibold text-[var(--primary)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                >
                  {message.actionLabel}
                </Link>
                {message.insightId && onSnooze && (
                  <button
                    type="button"
                    onClick={onSnooze}
                    className="inline-flex text-[13px] font-medium text-[var(--text-subtle)] hover:text-[var(--text)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                  >
                    Later
                  </button>
                )}
              </span>
            )
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss message"
          className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>
    </motion.div>
  );
}
