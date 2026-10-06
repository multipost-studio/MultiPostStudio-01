"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BellRing, MessageSquareWarning, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type DashboardAlert = { id: string; tone: "danger" | "warning"; text: string; href: string };

const STORAGE_KEY = "mps-dismissed-alerts";
/** A dismissed alert comes back after this long, so a real problem is never hidden for good. */
const SNOOZE_MS = 24 * 60 * 60 * 1000;

function readDismissed(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    const now = Date.now();
    return Object.fromEntries(Object.entries(parsed).filter(([, until]) => typeof until === "number" && until > now));
  } catch {
    return {};
  }
}

function writeDismissed(map: Record<string, number>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* private mode: the dismissal just lasts until reload */
  }
}

const TONE = {
  danger: "border-[var(--danger)]/35 bg-[var(--danger-soft)] text-[var(--danger)]",
  warning: "border-[var(--warning)]/40 bg-[var(--warning-soft)] text-[var(--warning)]",
} as const;

/**
 * "Needs attention" — workspace problems worth acting on, each dismissible.
 * Dismissals are per browser and last 24 hours (or until the alert's wording
 * changes, e.g. the count goes up).
 */
export function DashboardAlerts({ alerts }: { alerts: DashboardAlert[] }) {
  const [dismissed, setDismissed] = React.useState<Record<string, number>>({});
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setDismissed(readDismissed());
    setReady(true);
  }, []);

  const visible = alerts.filter((a) => !dismissed[a.id]);
  const hiddenCount = alerts.length - visible.length;

  function dismiss(id: string) {
    const next = { ...dismissed, [id]: Date.now() + SNOOZE_MS };
    setDismissed(next);
    writeDismissed(next);
  }

  function dismissAll() {
    const next = { ...dismissed, ...Object.fromEntries(visible.map((a) => [a.id, Date.now() + SNOOZE_MS])) };
    setDismissed(next);
    writeDismissed(next);
  }

  function restore() {
    setDismissed({});
    writeDismissed({});
  }

  // Server HTML shows every alert; after hydration, dismissed ones drop out.
  if (ready && visible.length === 0 && hiddenCount === 0) return null;

  return (
    <section aria-labelledby="dashboard-alerts-heading" className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="dashboard-alerts-heading" className="flex items-center gap-2 text-[15px] font-semibold text-[var(--text)]">
          <BellRing size={16} className="text-[var(--primary)]" aria-hidden />
          Needs your attention
          {visible.length > 0 && (
            <span className="rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-[12px] font-semibold text-[var(--primary)]">{visible.length}</span>
          )}
        </h2>
        <div className="flex items-center gap-3 text-[12.5px]">
          {visible.length > 1 && (
            <button type="button" onClick={dismissAll} className="font-medium text-[var(--text-muted)] hover:text-[var(--text)] hover:underline">
              Dismiss all
            </button>
          )}
          {hiddenCount > 0 && (
            <button type="button" onClick={restore} className="font-medium text-[var(--primary)] hover:underline">
              Show {hiddenCount} dismissed
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {visible.map((al) => (
          <li key={al.id} className={cn("flex items-center gap-1 rounded-full border pr-1.5 transition-colors hover:border-[var(--primary)]", TONE[al.tone])}>
            <Link href={al.href} className="group flex min-w-0 flex-1 items-center gap-2.5 py-2.5 pl-3.5 pr-2 focus-visible:outline-2 focus-visible:outline-[var(--ring)]">
              <MessageSquareWarning className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 text-[13px] font-medium leading-normal">{al.text}</span>
              <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70 transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
            <button
              type="button"
              onClick={() => dismiss(al.id)}
              aria-label={`Dismiss: ${al.text}`}
              title="Dismiss for 24 hours"
              className="shrink-0 rounded-full p-1.5 opacity-70 hover:bg-black/5 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            >
              <X size={14} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
