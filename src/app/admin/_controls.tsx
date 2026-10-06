"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PER_PAGE_OPTIONS } from "@/lib/admin-query";

type FilterDef = { key: string; label: string; options: { value: string; label: string }[] };

export function AdminToolbar({
  searchPlaceholder = "Search…",
  filters = [],
  exportType,
  dateRange = false,
  pagination = true,
  children,
}: {
  searchPlaceholder?: string;
  filters?: FilterDef[];
  /** Dataset key in lib/admin-exports; adds CSV + JSON export buttons that carry the current filters. */
  exportType?: string;
  /** Adds From / To (UTC day) filters on the list's date column. */
  dateRange?: boolean;
  /** Show the rows-per-page control. Hide it on lists that are not paginated. */
  pagination?: boolean;
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");

  const set = (patch: Record<string, string | null>) => {
    // Read the live URL, not the render-time snapshot, so two quick changes both stick.
    const p = new URLSearchParams(window.location.search);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    p.delete("page"); // any filter/search change resets to page 1
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };

  // debounce search
  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q) set({ q: q || null });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const exportHref = (format: "csv" | "json") => {
    const p = new URLSearchParams(params.toString());
    p.delete("page");
    p.delete("perPage"); // exports are not paginated
    p.set("dataset", exportType!);
    p.set("format", format);
    return `/api/admin/export?${p.toString()}`;
  };

  const filterKeys = [...filters.map((f) => f.key), ...(dateRange ? ["from", "to"] : [])];
  const active = (params.get("q") ?? "") !== "" || filterKeys.some((k) => params.get(k));
  const clear = () => {
    setQ("");
    const p = new URLSearchParams(window.location.search);
    for (const k of ["q", "page", ...filterKeys]) p.delete(k);
    router.replace(`${pathname}${p.toString() ? `?${p}` : ""}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={searchPlaceholder}
        aria-label={searchPlaceholder.replace(/…|\.\.\.$/, "").replace(/^\((.*)\)$/, "$1") || "Search"}
        className="h-9 w-64"
      />
      {filters.map((f) => (
        <Select
          key={f.key}
          aria-label={`Filter by ${f.label}`}
          value={params.get(f.key) ?? ""}
          onChange={(e) => set({ [f.key]: e.target.value || null })}
          size="sm"
          className="w-auto"
        >
          <option value="">{f.label}: all</option>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {f.label}: {o.label}
            </option>
          ))}
        </Select>
      ))}
      {dateRange && (
        <>
          <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
            From
            <Input type="date" size="sm" value={params.get("from") ?? ""} max={params.get("to") || undefined} onChange={(e) => set({ from: e.target.value || null })} className="w-auto" aria-label="From date (UTC)" />
          </label>
          <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
            To
            <Input type="date" size="sm" value={params.get("to") ?? ""} min={params.get("from") || undefined} onChange={(e) => set({ to: e.target.value || null })} className="w-auto" aria-label="To date (UTC)" />
          </label>
        </>
      )}
      {pagination && (
        <Select
          aria-label="Rows per page"
          value={params.get("perPage") ?? "50"}
          onChange={(e) => set({ perPage: e.target.value })}
          size="sm"
          className="w-auto"
        >
          {PER_PAGE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </Select>
      )}
      <div className="ml-auto flex items-center gap-2">
        {active && (
          <Button size="sm" variant="ghost" onClick={clear}>
            Clear filters
          </Button>
        )}
        {children}
        {exportType && (
          <>
            <Button size="sm" variant="secondary" asChild>
              <a href={exportHref("csv")}>Export CSV</a>
            </Button>
            <Button size="sm" variant="secondary" asChild>
              <a href={exportHref("json")}>JSON</a>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

export function Pagination({ page, perPage, total }: { page: number; perPage: number; total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / perPage));
  const go = (p: number) => {
    const q = new URLSearchParams(params.toString());
    if (p <= 1) q.delete("page");
    else q.set("page", String(p));
    router.replace(`${pathname}${q.toString() ? `?${q}` : ""}`);
  };
  const from = total === 0 ? 0 : (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);

  return (
    <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
      <span>
        {from}–{to} of {total.toLocaleString()}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => go(page - 1)}>
          ← Prev
        </Button>
        <span className="px-2 tabular-nums">
          {page} / {pages}
        </span>
        <Button size="sm" variant="ghost" disabled={page >= pages} onClick={() => go(page + 1)}>
          Next →
        </Button>
      </div>
    </div>
  );
}

/** Clickable column header that toggles ?sort= / ?dir=. */
export function SortHeader({ field, label }: { field: string; label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const active = (params.get("sort") ?? "createdAt") === field;
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const toggle = () => {
    const q = new URLSearchParams(params.toString());
    q.set("sort", field);
    q.set("dir", active && dir === "desc" ? "asc" : "desc");
    q.delete("page");
    router.replace(`${pathname}?${q}`);
  };
  return (
    <button onClick={toggle} className="inline-flex items-center gap-1 font-semibold hover:text-[var(--text)]">
      {label} {active ? (dir === "asc" ? "▲" : "▼") : ""}
    </button>
  );
}
