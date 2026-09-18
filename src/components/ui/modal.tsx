"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const reduce = useReducedMotion();
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const descId = React.useId();
  const previouslyFocused = React.useRef<HTMLElement | null>(null);

  React.useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      // Focus trap: Tab cycles inside the dialog instead of escaping behind
      // the overlay. Previously focus could leave the modal entirely.
      if (e.key === "Tab" && panelRef.current) {
        const items = Array.from(
          panelRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) {
          e.preventDefault();
          return;
        }
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    // Initial focus: first field, else the dialog itself (tabIndex -1).
    const t = setTimeout(() => {
      const firstField = panelRef.current?.querySelector<HTMLElement>("input, select, textarea");
      (firstField ?? panelRef.current)?.focus?.();
    }, 60);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose]);

  // Portalled to <body> because `position: fixed` is not relative to the
  // viewport when any ancestor has a filter, transform or backdrop-filter —
  // that ancestor becomes the containing block. The topbar uses backdrop-blur,
  // so a modal opened from a button inside it was laid out within the 64px
  // header and clipped to it.
  //
  // A portal contributes nothing to the in-tree output, so returning null on
  // the server and portalling on the client render the same thing in place —
  // no hydration mismatch, and no mounted flag needed.
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        /* Mobile: bottom-sheet (align end, no top gap) so long content gets
           maximum height and the close/footer stay reachable. Desktop keeps
           the centered dialog. dvh tracks the iOS URL bar collapsing. */
        <div className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center overflow-y-auto sm:items-start sm:justify-center sm:p-8">
          <motion.div
            className="fixed inset-0 bg-[var(--overlay)] backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title ? titleId : undefined}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className={cn(
              "mps-modal-panel relative z-10 flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg focus:outline-none sm:my-auto sm:rounded-[var(--radius-lg)]",
              size === "sm" && "sm:max-w-sm",
              size === "md" && "sm:max-w-lg",
              size === "lg" && "sm:max-w-2xl",
              size === "xl" && "sm:max-w-4xl",
            )}
          >
            {/* Mobile bottom-sheet visual drag handle */}
            <div className="mps-sheet-handle sm:hidden" aria-hidden />
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] p-4 sm:p-5">
              <div className="min-w-0">
                {title && (
                  <h2 id={titleId} className="text-[17px] font-semibold text-[var(--text)]">
                    {title}
                  </h2>
                )}
                {description && (
                  <p id={descId} className="mt-0.5 text-[14px] text-[var(--text-muted)]">
                    {description}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-5">{children}</div>
            {footer && (
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--border)] p-3.5 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:p-4 sm:px-5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
