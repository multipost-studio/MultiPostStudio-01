"use client";

import * as React from "react";
import Link from "next/link";
import { Search, SearchX } from "lucide-react";
import type { FaqGroup } from "@/lib/faq/data";
import { cn } from "@/lib/utils";

/** Search box + topic chips over every FAQ. Pure client-side filtering of what the server rendered. */
export function FaqExplorer({ groups }: { groups: FaqGroup[] }) {
  const [query, setQuery] = React.useState("");
  const [topic, setTopic] = React.useState<string>("all");

  const needle = query.trim().toLowerCase();
  const visible = React.useMemo(
    () =>
      groups
        .filter((g) => topic === "all" || g.id === topic)
        .map((g) => ({ ...g, items: needle ? g.items.filter((i) => `${i.q} ${i.a}`.toLowerCase().includes(needle)) : g.items }))
        .filter((g) => g.items.length > 0),
    [groups, topic, needle],
  );
  const total = visible.reduce((n, g) => n + g.items.length, 0);

  // Deep links (/faq#security) pick the topic and scroll there.
  React.useEffect(() => {
    const id = window.location.hash.slice(1);
    if (id && groups.some((g) => g.id === id)) {
      setTopic(id);
      requestAnimationFrame(() => document.getElementById("faq-results")?.scrollIntoView({ block: "start" }));
    }
  }, [groups]);

  return (
    <div>
      <div className="mx-auto max-w-2xl">
        <div className="relative">
          <Search size={18} aria-hidden className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search the FAQ, e.g. “approvals” or “AI key”"
            aria-label="Search the FAQ"
            className="h-13 w-full rounded-full border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-3.5 pl-12 pr-5 text-[16px] text-[var(--text)] shadow-[var(--shadow-card)] placeholder:text-[var(--text-subtle)] focus-visible:border-[var(--primary)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          />
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-center gap-2" role="group" aria-label="Topics">
        {[{ id: "all", title: "All topics" }, ...groups].map((g) => (
          <button
            key={g.id}
            type="button"
            aria-pressed={topic === g.id}
            onClick={() => setTopic(g.id)}
            className={cn(
              "rounded-full border px-4 py-2 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              topic === g.id ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
            )}
          >
            {g.title}
          </button>
        ))}
      </div>

      <p id="faq-results" role="status" aria-live="polite" className="mt-8 scroll-mt-28 text-center text-[13.5px] font-medium text-[var(--text-subtle)]">
        {needle ? `${total} answer${total === 1 ? "" : "s"} for “${query.trim()}”` : `${total} answers`}
      </p>

      {total === 0 ? (
        <div className="mx-auto mt-6 max-w-md rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-8 text-center">
          <SearchX size={26} aria-hidden className="mx-auto text-[var(--text-subtle)]" />
          <p className="mt-3 text-[16px] font-bold text-[var(--text)]">Nothing matches that</p>
          <p className="mt-1 text-[14.5px] text-[var(--text-muted)]">Try a shorter word, or ask us directly. We read every message.</p>
          <Link href="/contact" className="mt-4 inline-flex rounded-full bg-[var(--primary)] px-5 py-2.5 text-[14.5px] font-semibold text-[var(--primary-text)]">
            Contact us
          </Link>
        </div>
      ) : (
        <div className="mx-auto mt-6 max-w-3xl space-y-10">
          {visible.map((g) => (
            <section key={g.id} id={g.id} aria-labelledby={`faq-${g.id}`} className="scroll-mt-28">
              <h2 id={`faq-${g.id}`} className="text-[1.5rem] font-extrabold tracking-[-0.02em] text-[var(--text)]">
                {g.title}
              </h2>
              <p className="mt-1 text-[15px] text-[var(--text-muted)]">{g.blurb}</p>
              <div className="mt-4 space-y-3">
                {g.items.map((item) => (
                  <details key={item.q} className="group mps-block mps-faq px-5 py-4" open={needle.length > 1 ? true : undefined}>
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-bold leading-snug text-[var(--text)]">
                      <span>{item.q}</span>
                      <span aria-hidden className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[18px] leading-none text-[var(--primary)] transition-transform duration-200 group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mps-faq-body mt-2 text-[15px] font-medium leading-relaxed text-[var(--text-muted)]">{item.a}</p>
                  </details>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
