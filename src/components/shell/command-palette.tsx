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

type Entry = { label: string; href: string; section: "Quick actions" | "Pages" };

const ALL: Entry[] = [
  ...QUICK.map((q) => ({ ...q, section: "Quick actions" as const })),
  // Dedupe against QUICK by href: "Open calendar" vs "Calendar" both pointed
  // at /calendar, which read as two different destinations.
  ...NAV.flatMap((g) => g.items.map((i) => ({ label: i.label, href: i.href, section: "Pages" as const }))).filter(
    (n) => !QUICK.some((q) => q.href === n.href),
  ),
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
    : QUICK.map((item) => ({ ...item, section: "Quick actions" as const }));

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  // Grouped presentation with listbox semantics: the active option is exposed
  // via aria-activedescendant so screen readers announce it (previously the
  // highlight was color-only).
  let lastSection: string | null = null;

  return (
    <div className="fixed inset-0 z-[var(--z-palette)] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-[var(--overlay)]" onClick={() => onOpenChange(false)} aria-hidden />
      <div
        role="dialog"
        aria-label="Command menu"
        className="mps-scale-in relative z-10 w-full max-w-lg overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] shadow-lg"
      >
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3.5">
          <Search size={16} aria-hidden className="text-[var(--text-subtle)]" />
          <input
            autoFocus
            value={q}
            role="combobox"
            aria-expanded
            aria-controls="cmd-listbox"
            aria-activedescendant={results[active] ? `cmd-opt-${active}` : undefined}
            aria-label="Search or jump to"
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
              if (e.key === "Enter" && results[active]) go(results[active].href);
            }}
            placeholder="Search or jump to…"
            className="h-12 flex-1 bg-transparent text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)]"
          />
          <kbd className="rounded border border-[var(--border)] px-1.5 py-0.5 text-[11px] text-[var(--text-subtle)]">
            Esc
          </kbd>
        </div>
        <ul id="cmd-listbox" role="listbox" aria-label="Results" className="max-h-[320px] overflow-y-auto p-1.5">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-[14px] text-[var(--text-muted)]">No matches</li>
          )}
          {results.map((r, i) => {
            const showHeader = r.section !== lastSection;
            lastSection = r.section;
            return (
              <React.Fragment key={`${r.section}-${r.href}-${r.label}`}>
                {showHeader && (
                  <li
                    aria-hidden
                    className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-[var(--text-subtle)]"
                  >
                    {r.section}
                  </li>
                )}
                <li id={`cmd-opt-${i}`} role="option" aria-selected={i === active}>
                  <button
                    tabIndex={-1}
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
              </React.Fragment>
            );
          })}
        </ul>
        <div className="flex items-center gap-3 border-t border-[var(--border)] px-3.5 py-2 text-[11px] text-[var(--text-subtle)]">
          <span>
            <kbd className="rounded border border-[var(--border)] px-1">↑↓</kbd> navigate
          </span>
          <span>
            <kbd className="rounded border border-[var(--border)] px-1">↵</kbd> open
          </span>
          <span>
            <kbd className="rounded border border-[var(--border)] px-1">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
