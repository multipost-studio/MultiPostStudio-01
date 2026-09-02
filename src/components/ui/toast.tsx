"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

type ToastTone = "default" | "success" | "error" | "info";
type Toast = { id: string; title: string; description?: string; tone: ToastTone };

const ToastCtx = React.createContext<{
  toast: (t: Omit<Toast, "id" | "tone"> & { tone?: ToastTone }) => void;
} | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const toast = React.useCallback((t: Omit<Toast, "id" | "tone"> & { tone?: ToastTone }) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { id, tone: "default", ...t }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4200);
  }, []);

  return (
    <ToastCtx.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              role="status"
              layout
              initial={{ opacity: 0, x: 24, scale: 0.96 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
              className={cn(
                "pointer-events-auto rounded-[var(--radius-md)] border bg-[var(--bg-elevated)] p-3.5 shadow-lg",
                t.tone === "success" && "border-[var(--success)]",
                t.tone === "error" && "border-[var(--danger)]",
                t.tone === "info" && "border-[var(--info)]",
                t.tone === "default" && "border-[var(--border-strong)]",
              )}
            >
              <p className="text-[14px] font-semibold text-[var(--text)]">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{t.description}</p>}
            </motion.div>
          ))}
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
