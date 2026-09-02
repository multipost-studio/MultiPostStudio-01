"use client";

import * as React from "react";
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

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto p-4 sm:p-8">
          <motion.div
            className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 6 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className={cn(
              "relative z-10 my-auto w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg",
              size === "sm" && "max-w-sm",
              size === "md" && "max-w-lg",
              size === "lg" && "max-w-2xl",
              size === "xl" && "max-w-4xl",
            )}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-5">
              <div>
                {title && <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>}
                {description && <p className="mt-0.5 text-[14px] text-[var(--text-muted)]">{description}</p>}
              </div>
              <button
                onClick={onClose}
                className="rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-5">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 border-t border-[var(--border)] p-4 px-5">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
