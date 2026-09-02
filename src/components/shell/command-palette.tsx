"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const QUICK = [
  { label: "Create post", href: "/composer/new" },
  { label: "Add idea", href: "/ideas?new=1" },
  { label: "Open calendar", href: "/calendar" },
  { label: "Connect account", href: "/integrations" },
  { label: "New campaign", href: "/campaigns?new=1" },
  { label: "Build report", href: "/reports?new=1" },
  { label: "AI Content Studio", href: "/studio" },
  { label: "Daily briefing", href: "/dashboard" },
];

const ALL = [
  ...QUICK,
  ...NAV.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href }))),
];

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (open) {
      setQ("");
      setActive(0);
    }
  }, [open]);

  if (!open) return null;

  const results = q
    ? ALL.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())).slice(0, 8)
    : QUICK;

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-black/40" onClick={() => onOpenChange(false)} aria-hidden />
      <div
        role="dialog"
        aria-label="Command menu"
        className="cad-scale-in relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3.5">
          <Search size={16} className="text-[var(--text-subtle)]" />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
              if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
              if (e.key === "Enter" && results[active]) go(results[active].href);
            }}
            placeholder="Search or jump to…"
            className="h-12 flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-subtle)]">
            Esc
          </kbd>
        </div>
        <ul className="max-h-[320px] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-[14px] text-[var(--text-muted)]">No matches</li>
          )}
          {results.map((r, i) => (
            <li key={r.href + r.label}>
              <button
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r.href)}
                className={cn(
                  "flex w-full items-center rounded-[var(--radius-sm)] px-3 py-2 text-left text-[14px]",
                  i === active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text)]",
                )}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
