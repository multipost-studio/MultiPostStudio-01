"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { PER_PAGE_OPTIONS } from "@/lib/admin-query";
import { PROBE_CATEGORIES, PROBE_STATUSES, RANGES, RANGE_LABEL, TRIGGERS } from "@/lib/health/types";
import { STATUS_LABEL } from "./_status";
import { CATEGORY_LABEL } from "./_probe-card";

export type ToolbarProbe = { id: string; name: string };

/**
 * Filter + export bar for the History and Incidents tabs. State lives entirely in
 * the URL (shareable, back-button friendly) and every change resets to page 1.
 * Export links carry the same filters, so the file matches what is on screen.
 */
export function HealthToolbar({ mode, probes }: { mode: "history" | "incidents"; probes: ToolbarProbe[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");

  const set = React.useCallback(
    (patch: Record<string, string | null>) => {
      // Read the live URL, not the render-time snapshot, so two quick changes both stick.
      const p = new URLSearchParams(window.location.search);
      for (const [k, v] of Object.entries(patch)) {
        if (!v) p.delete(k);
        else p.set(k, v);
      }
      p.delete("page");
      router.replace(`${pathname}?${p}`);
    },
    [pathname, router],
  );

  React.useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get("q") ?? "") !== q.trim()) set({ q: q.trim() || null });
    }, 350);
    return () => clearTimeout(t);
  }, [q, params, set]);

  const get = (k: string) => params.get(k) ?? "";
  const keys = mode === "history" ? ["q", "probe", "status", "category", "trigger", "from", "to"] : ["q", "probe", "status", "category", "state", "range", "from", "to"];
  const active = keys.some((k) => get(k));

  const clear = () => {
    setQ("");
    const p = new URLSearchParams(window.location.search);
    for (const k of [...keys, "page"]) p.delete(k);
    router.replace(`${pathname}?${p}`);
  };

  const exportHref = (format: "csv" | "json") => {
    const p = new URLSearchParams({ scope: mode, format });
    for (const k of keys) if (get(k)) p.set(k, get(k));
    return `/api/admin/health/export?${p}`;
  };

  const statusOptions = mode === "history" ? PROBE_STATUSES : (["degraded", "unhealthy"] as const);

  return (
    <div className="space-y-3 rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={mode === "history" ? "Search messages or probe names…" : "Search incidents…"} aria-label="Search" className="h-9 w-full sm:w-72" />
        <Select aria-label="Filter by probe" size="sm" value={get("probe")} onChange={(e) => set({ probe: e.target.value || null })} className="w-auto">
          <option value="">Probe: all</option>
          {probes.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
        <Select aria-label={mode === "history" ? "Filter by status" : "Filter by severity"} size="sm" value={get("status")} onChange={(e) => set({ status: e.target.value || null })} className="w-auto">
          <option value="">{mode === "history" ? "Status: all" : "Severity: all"}</option>
          {statusOptions.map((s) => (
            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
          ))}
        </Select>
        <Select aria-label="Filter by category" size="sm" value={get("category")} onChange={(e) => set({ category: e.target.value || null })} className="w-auto">
          <option value="">Category: all</option>
          {PROBE_CATEGORIES.map((c) => (
            <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
          ))}
        </Select>
        {mode === "history" ? (
          <Select aria-label="Filter by trigger" size="sm" value={get("trigger")} onChange={(e) => set({ trigger: e.target.value || null })} className="w-auto">
            <option value="">Trigger: all</option>
            {TRIGGERS.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </Select>
        ) : (
          <>
            <Select aria-label="Filter by state" size="sm" value={get("state")} onChange={(e) => set({ state: e.target.value || null })} className="w-auto">
              <option value="">State: all</option>
              <option value="open">Open</option>
              <option value="resolved">Resolved</option>
            </Select>
            <Select aria-label="Time window" size="sm" value={get("range") || "7d"} onChange={(e) => set({ range: e.target.value === "7d" ? null : e.target.value, from: null, to: null })} className="w-auto" disabled={!!get("from") || !!get("to")}>
              {RANGES.map((r) => (
                <option key={r} value={r}>{RANGE_LABEL[r]}</option>
              ))}
            </Select>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
          From
          <Input type="date" size="sm" value={get("from")} max={get("to") || undefined} onChange={(e) => set({ from: e.target.value || null })} className="w-auto" aria-label="From date (UTC)" />
        </label>
        <label className="flex items-center gap-1.5 text-[12.5px] text-[var(--text-muted)]">
          To
          <Input type="date" size="sm" value={get("to")} min={get("from") || undefined} onChange={(e) => set({ to: e.target.value || null })} className="w-auto" aria-label="To date (UTC)" />
        </label>
        <span className="text-[11.5px] text-[var(--text-subtle)]">dates are UTC</span>
        {mode === "history" && (
          <Select aria-label="Rows per page" size="sm" value={get("perPage") || "50"} onChange={(e) => set({ perPage: e.target.value === "50" ? null : e.target.value })} className="w-auto">
            {PER_PAGE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </Select>
        )}
        {active && (
          <Button size="sm" variant="ghost" onClick={clear} className="gap-1"><X size={13} /> Clear filters</Button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" asChild className="gap-1.5"><a href={exportHref("csv")}><Download size={13} /> CSV</a></Button>
          <Button size="sm" variant="secondary" asChild className="gap-1.5"><a href={exportHref("json")}><Download size={13} /> JSON</a></Button>
        </div>
      </div>
    </div>
  );
}
