"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "error" | "info" | "warning";
type Toast = { id: string; title: string; description?: string; tone: ToastTone };

const TONE_ICON = {
  default: null,
  success: CheckCircle2,
  error: XCircle,
  info: Info,
  warning: AlertTriangle,
} as const;

/** Maximum concurrent toasts — beyond this the oldest is dropped. */
const MAX_TOASTS = 4;

const ToastCtx = React.createContext<{
  toast: (t: Omit<Toast, "id" | "tone"> & { tone?: ToastTone }) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((t: Omit<Toast, "id" | "tone"> & { tone?: ToastTone }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev.slice(-(MAX_TOASTS - 1)), { id, tone: "default", ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div
        role="region"
        aria-label="Notifications"
        className="pointer-events-none fixed bottom-4 right-4 z-[var(--z-toast)] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2"
      >
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const Icon = TONE_ICON[t.tone];
            return (
              <motion.div
                key={t.id}
                role="status"
                layout
                initial={{ opacity: 0, x: 24, scale: 0.96 }}
                animate={{ opacity: 1, x: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 320, damping: 30 }}
                className={cn(
                  "pointer-events-auto flex items-start gap-2.5 rounded-[var(--radius-md)] border bg-[var(--bg-elevated)] p-3.5 shadow-lg",
                  t.tone === "success" && "border-[var(--success)]",
                  t.tone === "error" && "border-[var(--danger)]",
                  t.tone === "info" && "border-[var(--info)]",
                  t.tone === "warning" && "border-[var(--warning)]",
                  t.tone === "default" && "border-[var(--border-strong)]",
                )}
              >
                {Icon && <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--text-muted)]" />}
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[var(--text)]">{t.title}</p>
                  {t.description && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(t.id)}
                  aria-label="Dismiss notification"
                  className="shrink-0 rounded-[var(--radius-sm)] p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
                >
                  <X size={14} aria-hidden />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastCtx);
  if (!ctx) return { toast: () => {} };
  return ctx;
}
