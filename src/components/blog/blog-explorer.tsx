"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Clock, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BlogCover } from "@/components/blog/blog-cover";
import { cn, formatDate } from "@/lib/utils";

export type ExplorerPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  author: string;
  readMins: number;
  tag: string;
};

const PAGE = 12;

/**
 * Blog index: featured article, category filter, search and a card grid with
 * generated cover art. Filtering is instant and client-side (a few dozen posts),
 * the list itself is server-rendered first so it is fully crawlable.
 */
export function BlogExplorer({ posts }: { posts: ExplorerPost[] }) {
  const [category, setCategory] = React.useState<string>("All");
  const [query, setQuery] = React.useState("");
  const [shown, setShown] = React.useState(PAGE);

  const categories = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) counts.set(p.tag, (counts.get(p.tag) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [posts]);

  const q = query.trim().toLowerCase();
  const filtered = posts.filter((p) => (category === "All" || p.tag === category) && (!q || `${p.title} ${p.excerpt} ${p.tag}`.toLowerCase().includes(q)));
  const filtering = category !== "All" || q.length > 0;
  const featured = !filtering ? filtered[0] : undefined;
  const rest = featured ? filtered.slice(1) : filtered;
  const visible = rest.slice(0, shown);

  return (
    <div>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
          {[["All", posts.length] as const, ...categories].map(([name, count]) => (
            <button
              key={name}
              type="button"
              aria-pressed={category === name}
              onClick={() => {
                setCategory(name);
                setShown(PAGE);
              }}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13.5px] font-semibold transition-all duration-200 active:scale-95",
                category === name
                  ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)] shadow-sm"
                  : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:-translate-y-0.5 hover:border-[var(--primary)] hover:text-[var(--text)]",
              )}
            >
              {name}
              <span className={cn("text-[11.5px] tabular-nums", category === name ? "opacity-85" : "text-[var(--text-subtle)]")}>{count}</span>
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Search articles"
            aria-label="Search articles"
            className="h-10 w-full rounded-full border border-[var(--border-strong)] bg-[var(--surface)] pl-9 pr-9 text-[14px] text-[var(--text)] outline-none transition-shadow placeholder:text-[var(--text-subtle)] focus:border-[var(--primary)] focus:shadow-[0_0_0_4px_var(--primary-soft)]"
          />
          {query && (
            <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-[var(--text-subtle)] hover:text-[var(--text)]">
              <X size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {filtered.length} article{filtered.length === 1 ? "" : "s"} shown
      </p>

      {featured && (
        <Link
          href={`/blog/${featured.slug}`}
          className="group/card mps-rise mb-8 grid overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-xl md:grid-cols-[1.15fr_1fr]"
        >
          <BlogCover slug={featured.slug} title={featured.title} category={featured.tag} size="lg" className="md:h-full md:aspect-auto md:min-h-[300px]" />
          <div className="flex flex-col justify-center gap-3 p-6 sm:p-8">
            <div className="flex items-center gap-2">
              <Badge tone="primary">{featured.tag}</Badge>
              <span className="text-[12px] font-semibold uppercase tracking-wide text-[var(--primary)]">Latest</span>
            </div>
            <h2 className="text-[1.5rem] font-extrabold leading-tight tracking-tight text-[var(--text)] sm:text-[1.9rem]">{featured.title}</h2>
            <p className="text-[15px] leading-relaxed text-[var(--text-muted)]">{featured.excerpt}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-[var(--text-subtle)]">
              <span>{formatDate(featured.date)}</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={13} aria-hidden /> {featured.readMins} min read
              </span>
            </div>
            <span className="mt-1 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[var(--primary)]">
              Read the article <ArrowRight size={15} aria-hidden className="transition-transform duration-300 group-hover/card:translate-x-1" />
            </span>
          </div>
        </Link>
      )}

      {visible.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center">
          <p className="text-[16px] font-semibold text-[var(--text)]">No articles match that.</p>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">Try a different word or pick another category.</p>
          <button
            type="button"
            onClick={() => {
              setCategory("All");
              setQuery("");
            }}
            className="mt-4 text-[14px] font-semibold text-[var(--primary)] hover:underline"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p, i) => (
            <li key={p.slug} className="mps-rise" style={{ animationDelay: `${Math.min(i, 8) * 55}ms` }}>
              <Link
                href={`/blog/${p.slug}`}
                className="group/card flex h-full flex-col overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[var(--primary)] hover:shadow-lg focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <BlogCover slug={p.slug} title={p.title} category={p.tag} size="md" />
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <Badge tone="primary" className="self-start">
                    {p.tag}
                  </Badge>
                  <h3 className="text-[17px] font-bold leading-snug text-[var(--text)] transition-colors group-hover/card:text-[var(--primary)]">{p.title}</h3>
                  <p className="line-clamp-3 text-[14px] leading-relaxed text-[var(--text-muted)]">{p.excerpt}</p>
                  <p className="mt-auto flex items-center gap-3 pt-2 text-[12.5px] text-[var(--text-subtle)]">
                    <span>{formatDate(p.date)}</span>
                    <span className="inline-flex items-center gap-1">
                      <Clock size={12} aria-hidden /> {p.readMins} min
                    </span>
                    <ArrowRight size={14} aria-hidden className="ml-auto text-[var(--primary)] opacity-0 transition-all duration-300 group-hover/card:translate-x-1 group-hover/card:opacity-100" />
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {rest.length > shown && (
        <div className="mt-8 text-center">
          <button
            type="button"
            onClick={() => setShown((n) => n + PAGE)}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--border-strong)] bg-[var(--surface)] px-6 text-[14px] font-semibold text-[var(--text)] shadow-sm transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-md active:scale-95"
          >
            Show more articles <span className="text-[var(--text-subtle)]">({rest.length - shown} left)</span>
          </button>
        </div>
      )}
    </div>
  );
}
