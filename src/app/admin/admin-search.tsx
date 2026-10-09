"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Building2, LifeBuoy, Receipt, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminSearchResult } from "@/lib/admin-search";

const ICON = { user: User, organization: Building2, ticket: LifeBuoy, invoice: Receipt } as const;
const LABEL = { user: "Users", organization: "Organizations", ticket: "Support tickets", invoice: "Invoices" } as const;

/** Header search for platform staff. Press "/" to focus; arrows and Enter to open a result. */
export function AdminSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<AdminSearchResult[]>([]);
  const [state, setState] = React.useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const boxRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  React.useEffect(() => {
    const term = q.trim();
    // Below two characters the panel is hidden (see showPanel), so there is nothing to reset here.
    if (term.length < 2) return;
    const ac = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(term)}`, { signal: ac.signal, cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { results: AdminSearchResult[] };
        setResults(data.results);
        setActive(0);
        setState("idle");
      } catch (e) {
        if ((e as { name?: string }).name !== "AbortError") setState("error");
      }
    }, 250);
    return () => {
      clearTimeout(t);
      ac.abort();
    };
  }, [q]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.key === "/" && tag !== "INPUT" && tag !== "TEXTAREA" && !(e.target as HTMLElement | null)?.isContentEditable) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, []);

  const go = (r: AdminSearchResult) => {
    setOpen(false);
    setQ("");
    router.push(r.href);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "ArrowDown" && results.length) {
      e.preventDefault();
      setActive((a) => (a + 1) % results.length);
    } else if (e.key === "ArrowUp" && results.length) {
      e.preventDefault();
      setActive((a) => (a - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && results[active]) {
      e.preventDefault();
      go(results[active]);
    }
  };

  const showPanel = open && q.trim().length >= 2;
  let lastType: string | null = null;

  return (
    <div ref={boxRef} className="relative hidden min-w-0 flex-1 sm:block sm:max-w-sm">
      <label className="sr-only" htmlFor={`${listId}-input`}>
        Search users, organizations, tickets and invoices
      </label>
      <Search size={14} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
      <input
        ref={inputRef}
        id={`${listId}-input`}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls={listId}
        aria-autocomplete="list"
        value={q}
        maxLength={80}
        onChange={(e) => {
          setQ(e.target.value);
          setState(e.target.value.trim().length >= 2 ? "loading" : "idle");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKey}
        placeholder="Search users, orgs, tickets, invoices   ( / )"
        className="mps-pill h-10 w-full bg-[var(--surface)] pl-8 pr-3 text-[14px] text-[var(--text)] outline-none placeholder:text-[var(--text-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
      />
      {showPanel && (
        <div id={listId} role="listbox" className="absolute left-0 right-0 top-12 z-50 max-h-[min(60vh,420px)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-elevated)] p-1 shadow-xl">
          {state === "error" ? (
            <p className="px-3 py-4 text-[13px] text-[var(--danger)]">Search failed. Try again.</p>
          ) : state === "loading" && results.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-[var(--text-muted)]">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-[var(--text-muted)]">No matches for “{q.trim()}”.</p>
          ) : (
            results.map((r, i) => {
              const Icon = ICON[r.type];
              const header = lastType !== r.type ? LABEL[r.type] : null;
              lastType = r.type;
              return (
                <React.Fragment key={`${r.type}:${r.id}`}>
                  {header && <p className="px-2.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{header}</p>}
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn("flex w-full items-center gap-2.5 rounded-[var(--radius-sm)] px-2.5 py-2 text-left", i === active ? "bg-[var(--surface-hover)]" : "")}
                  >
                    <Icon size={15} aria-hidden className="shrink-0 text-[var(--text-subtle)]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-medium text-[var(--text)]">{r.title}</span>
                      <span className="block truncate text-[12px] text-[var(--text-muted)]">{r.subtitle}</span>
                    </span>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
