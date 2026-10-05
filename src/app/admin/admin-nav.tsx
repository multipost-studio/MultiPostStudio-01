"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Search, X } from "lucide-react";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";
import { activeHref, filterNav, groupNav, type AdminNavItem } from "@/lib/admin-nav";
import type { SignalPriority } from "@/lib/admin-signals";

type Badge = { count: number; priority: SignalPriority };

const COLLAPSE_KEY = "mps-admin-nav-collapsed";
const COLLAPSE_EVENT = "mps-admin-nav-change";

function subscribeCollapsed(cb: () => void) {
  window.addEventListener(COLLAPSE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(COLLAPSE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function readCollapsed(): string {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) ?? "";
  } catch {
    return "";
  }
}

function parseCollapsed(raw: string): Set<string> {
  try {
    const v: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

const DOT: Record<SignalPriority, string> = {
  info: "bg-[var(--text-subtle)] text-[var(--text-inverted)]",
  warn: "bg-[var(--warning)] text-[var(--text-inverted)]",
  critical: "bg-[var(--danger)] text-[var(--text-inverted)]",
};
const PRIORITY_RANK: Record<SignalPriority, number> = { info: 0, warn: 1, critical: 2 };

/**
 * Admin navigation: collapsible groups (remembered), a "find a page" filter
 * (press / to focus, Enter to open the top result), exactly one highlighted
 * item, and per-module attention badges that roll up onto a collapsed group
 * so nothing urgent hides behind a closed section.
 */
export function AdminNav({
  items,
  badges,
  onNavigate,
}: {
  items: AdminNavItem[];
  badges: Record<string, Badge>;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const active = React.useMemo(() => activeHref(items, pathname), [items, pathname]);
  const groups = React.useMemo(() => groupNav(items), [items]);
  const activeGroup = items.find((i) => i.href === active)?.group ?? null;

  const [query, setQuery] = React.useState("");
  const raw = React.useSyncExternalStore(subscribeCollapsed, readCollapsed, () => "");
  const stored = React.useMemo(() => parseCollapsed(raw), [raw]);
  // The group holding the current page is always open, so you can never lose where you are.
  const collapsed = React.useMemo(() => {
    const next = new Set(stored);
    if (activeGroup) next.delete(activeGroup);
    return next;
  }, [stored, activeGroup]);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const toggle = (title: string) => {
    const next = new Set(stored);
    if (next.has(title)) next.delete(title);
    else next.add(title);
    try {
      window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
    } catch {
      /* storage blocked: toggles last until reload */
    }
    window.dispatchEvent(new Event(COLLAPSE_EVENT));
  };

  // "/" focuses the filter from anywhere that is not a text field.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const results = query.trim() ? filterNav(items, query) : null;

  const link = (i: AdminNavItem) => {
    const b = badges[i.label];
    const isActive = i.href === active;
    return (
      <Link
        key={i.href}
        href={i.href}
        onClick={onNavigate}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-[13.5px] font-medium transition-colors",
          isActive ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
        )}
      >
        <Icon name={i.icon} size={15} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate">{i.label}</span>
        {results && i.group && <span className="shrink-0 text-[11px] text-[var(--text-subtle)]">{i.group}</span>}
        {b && b.count > 0 && (
          <span
            className={cn("min-w-[18px] rounded-full px-1 text-center text-[11px] font-semibold tabular-nums", DOT[b.priority])}
            title={`${b.count} need${b.count === 1 ? "s" : ""} attention`}
          >
            {b.count > 99 ? "99+" : b.count}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative mb-3">
        <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              inputRef.current?.blur();
            }
            if (e.key === "Enter" && results?.[0]) {
              router.push(results[0].href);
              setQuery("");
              onNavigate?.();
            }
          }}
          placeholder="Find a page"
          aria-label="Find an admin page"
          className="h-8 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] pl-8 pr-14 text-[13px] text-[var(--text)] placeholder:text-[var(--text-subtle)]"
        />
        {query ? (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-[var(--text-subtle)] hover:text-[var(--text)]"
          >
            <X size={13} aria-hidden />
          </button>
        ) : (
          <kbd aria-hidden className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-[var(--border)] px-1.5 text-[11px] text-[var(--text-subtle)]">
            /
          </kbd>
        )}
      </div>

      <nav aria-label="Administration" className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain pr-0.5">
        {results ? (
          results.length ? (
            <div className="space-y-0.5">{results.map(link)}</div>
          ) : (
            <p role="status" className="px-2.5 py-3 text-[13px] text-[var(--text-subtle)]">
              No page matches &quot;{query}&quot;.
            </p>
          )
        ) : (
          groups.map((g) => {
            if (!g.title) return <div key="top" className="space-y-0.5 pb-1">{g.items.map(link)}</div>;
            const open = !collapsed.has(g.title);
            // Roll attention up onto a closed group.
            const rolled = g.items.reduce<{ count: number; priority: SignalPriority } | null>((acc, i) => {
              const b = badges[i.label];
              if (!b || b.count <= 0) return acc;
              return acc ? { count: acc.count + b.count, priority: PRIORITY_RANK[b.priority] > PRIORITY_RANK[acc.priority] ? b.priority : acc.priority } : { ...b };
            }, null);
            const panelId = `admin-nav-${g.title.replace(/\W+/g, "-").toLowerCase()}`;
            return (
              <section key={g.title}>
                <button
                  type="button"
                  onClick={() => toggle(g.title!)}
                  aria-expanded={open}
                  aria-controls={panelId}
                  className="group flex w-full items-center gap-1 rounded-[var(--radius-sm)] px-2.5 pb-1 pt-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-subtle)] transition-colors hover:text-[var(--text)]"
                >
                  <span className="min-w-0 flex-1 truncate">{g.title}</span>
                  {!open && rolled && <span aria-label={`${rolled.count} need attention`} className={cn("h-1.5 w-1.5 rounded-full", DOT[rolled.priority].split(" ")[0])} />}
                  <ChevronDown size={13} aria-hidden className={cn("shrink-0 transition-transform duration-200", !open && "-rotate-90")} />
                </button>
                {/* grid-rows trick: animates to the content's natural height without measuring it */}
                <div id={panelId} className={cn("grid transition-[grid-template-rows] duration-200 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
                  <div className={cn("space-y-0.5 overflow-hidden", !open && "invisible")} aria-hidden={!open}>
                    {g.items.map(link)}
                  </div>
                </div>
              </section>
            );
          })
        )}
      </nav>
    </div>
  );
}
