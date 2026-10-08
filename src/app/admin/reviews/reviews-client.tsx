"use client";

import * as React from "react";
import { Plus, Star, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Stars } from "@/components/reviews/stars";
import type { ReviewRecord } from "@/lib/reviews/model";
import type { ReviewConfig } from "@/lib/reviews/config";
import type { AdminFilters, ReviewStats } from "@/lib/reviews/repo";
import { cn } from "@/lib/utils";
import { ReviewForm } from "./_form";
import { ExportButtons, ImportDialog } from "./_import";
import { ReviewList, type ListData } from "./_list";
import { SettingsTab } from "./_settings";

type Tab = "reviews" | "settings";

function Tile({ label, value, hint, accent }: { label: string; value: React.ReactNode; hint?: React.ReactNode; accent?: boolean }) {
  return (
    <div className={cn("rounded-[var(--radius-lg)] border bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]", accent ? "border-[var(--warning)]/50" : "border-[var(--border)]/70")}>
      <p className="text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className="mps-metric mt-1 text-[28px] font-extrabold leading-none text-[var(--text)]">{value}</p>
      {hint && <div className="mt-2 text-[12.5px] text-[var(--text-muted)]">{hint}</div>}
    </div>
  );
}

export function ReviewsClient({ initialTab, filters, stats, list, initialConfig }: { initialTab: Tab; filters: AdminFilters; stats: ReviewStats; list: ListData; initialConfig: ReviewConfig }) {
  const [tab, setTab] = React.useState<Tab>(initialTab);
  const [editing, setEditing] = React.useState<ReviewRecord | null>(null);
  const [formOpen, setFormOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);

  function pick(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === "reviews") url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.replaceState(null, "", url);
  }

  const max = Math.max(1, ...stats.published.distribution);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="flex items-center gap-3 text-3xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[40px]">
            <Star className="h-8 w-8 shrink-0 text-[var(--primary)]" aria-hidden /> Reviews
          </h1>
          <p className="mt-1 max-w-2xl text-[15px] text-[var(--text-muted)]">Moderate customer reviews, add or import your own, and control when customers are asked.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButtons filters={filters} />
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload size={13} aria-hidden /> Import
          </Button>
          <Button
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus size={15} aria-hidden /> Add review
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Tile label="Waiting for you" value={stats.pending} accent={stats.pending > 0} hint={stats.pending > 0 ? "Pending reviews to check" : "Nothing to check"} />
        <Tile label="Published" value={stats.approved} hint={stats.published.count > 0 ? <span className="inline-flex items-center gap-1.5"><Stars rating={stats.published.average} size={13} /> {stats.published.average.toFixed(1)} average</span> : "Not on the site yet"} />
        <Tile label="Private feedback" value={stats.privateFeedback} hint="Customers who didn't publish" />
        <Tile label="Last 30 days" value={stats.last30Days} hint="New reviews" />
        <Tile label="Overall average" value={stats.overall.count ? stats.overall.average.toFixed(1) : "–"} hint={`${stats.overall.count} rating${stats.overall.count === 1 ? "" : "s"}, any status`} />
      </div>

      {stats.published.count > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-4 shadow-[var(--shadow-card)]">
          <p className="text-[13px] font-semibold text-[var(--text)]">Published rating spread</p>
          <ul className="mt-2 grid gap-1.5 sm:grid-cols-5 sm:gap-3">
            {stats.published.distribution.map((n, i) => (
              <li key={i} className="flex items-center gap-2 text-[12.5px] text-[var(--text-muted)] sm:flex-col sm:items-stretch sm:gap-1">
                <span className="w-8 shrink-0 font-semibold sm:w-auto">{5 - i} ★ · {n}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--surface-hover)]">
                  <span className="block h-full rounded-full bg-[#f5a623]" style={{ width: `${(n / max) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div role="tablist" aria-label="Reviews sections" className="flex gap-1 border-b border-[var(--border)]">
        {(["reviews", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            id={`rv-tab-${t}`}
            aria-controls={`rv-panel-${t}`}
            onClick={() => pick(t)}
            className={cn("relative px-4 py-3 text-[14px] font-semibold capitalize transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]", tab === t ? "text-[var(--primary)]" : "text-[var(--text-muted)] hover:text-[var(--text)]")}
          >
            {t}
            {tab === t && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[var(--primary)]" />}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`rv-panel-${tab}`} aria-labelledby={`rv-tab-${tab}`} className="mps-page-in">
        {tab === "reviews" ? (
          <ReviewList
            filters={filters}
            list={list}
            stats={stats}
            onEdit={(r) => {
              setEditing(r);
              setFormOpen(true);
            }}
          />
        ) : (
          <SettingsTab initial={initialConfig} />
        )}
      </div>

      <ReviewForm open={formOpen} review={editing} onClose={() => setFormOpen(false)} />
      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}
