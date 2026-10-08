"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Check, EyeOff, Pencil, Search, Star, Trash2, X } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { ReviewAvatar } from "@/components/reviews/review-card";
import { Stars } from "@/components/reviews/stars";
import { bulkReviewAction, type BulkOp } from "@/app/actions/admin-reviews";
import type { ReviewRecord, ReviewStatus } from "@/lib/reviews/model";
import type { AdminFilters, ReviewStats } from "@/lib/reviews/repo";
import { cn } from "@/lib/utils";

const STATUS_TONE: Record<ReviewStatus, BadgeTone> = { pending: "warning", approved: "success", rejected: "danger", hidden: "neutral" };
const STATUS_LABEL: Record<ReviewStatus, string> = { pending: "Pending", approved: "Published", rejected: "Rejected", hidden: "Hidden" };
const DATE = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" });

export type ListData = { rows: ReviewRecord[]; total: number; page: number; pages: number };

export function ReviewList({ filters, list, stats, onEdit }: { filters: AdminFilters; list: ListData; stats: ReviewStats; onEdit: (r: ReviewRecord) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [q, setQ] = React.useState(filters.q ?? "");

  // A fresh page of results starts with nothing selected.
  React.useEffect(() => setSelected(new Set()), [list.rows]);

  function go(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "" || v === "all") next.delete(k);
      else next.set(k, v);
    }
    if (!("page" in patch)) next.delete("page");
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Search as you type, but not on every keystroke.
  React.useEffect(() => {
    if ((filters.q ?? "") === q.trim()) return;
    const t = setTimeout(() => go({ q: q.trim() || null }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  async function run(ids: string[], op: BulkOp) {
    if (op === "delete") {
      const ok = await confirm({ title: `Delete ${ids.length} review${ids.length === 1 ? "" : "s"}?`, body: "This is permanent. To take a review off the site but keep it, hide it instead.", confirmLabel: "Delete", destructive: true });
      if (!ok) return;
    }
    setBusy(true);
    const res = await bulkReviewAction({ ids, op });
    setBusy(false);
    if (res.ok) {
      toast({ title: res.message, tone: "success" });
      setSelected(new Set());
      router.refresh();
    } else toast({ title: "Couldn't do that", description: res.errors[0], tone: "error" });
  }

  const ids = list.rows.map((r) => r.id);
  const allOn = ids.length > 0 && ids.every((id) => selected.has(id));
  const chips: { id: string; label: string; n: number }[] = [
    { id: "all", label: "All", n: stats.total },
    { id: "pending", label: "Pending", n: stats.pending },
    { id: "approved", label: "Published", n: stats.approved },
    { id: "rejected", label: "Rejected", n: stats.rejected },
    { id: "hidden", label: "Hidden", n: stats.hidden },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by status">
        {chips.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={(filters.status ?? "all") === c.id}
            onClick={() => go({ status: c.id })}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-[var(--ring)]",
              (filters.status ?? "all") === c.id ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary-hover)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
            )}
          >
            {c.label}
            <span className="rounded-full bg-[var(--surface-hover)] px-1.5 text-[11.5px] leading-[18px]">{c.n}</span>
          </button>
        ))}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.6fr_repeat(2,1fr)_auto_auto]">
        <div className="relative">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, role or text" aria-label="Search reviews" className="pl-9" />
        </div>
        <Select value={filters.rating ? String(filters.rating) : "all"} onChange={(e) => go({ rating: e.target.value })} aria-label="Filter by rating">
          <option value="all">Any rating</option>
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {n} star{n === 1 ? "" : "s"}
            </option>
          ))}
        </Select>
        <Select value={filters.source ?? "all"} onChange={(e) => go({ source: e.target.value })} aria-label="Filter by source">
          <option value="all">Any source</option>
          <option value="in_app">Written in the app</option>
          <option value="manual">Added by hand</option>
          <option value="import">Imported</option>
        </Select>
        <Button variant={filters.featured ? "primary" : "secondary"} size="sm" aria-pressed={!!filters.featured} onClick={() => go({ featured: filters.featured ? null : "1" })} className="h-10">
          <Star size={14} aria-hidden /> Featured
        </Button>
        <Button variant={filters.privateOnly ? "primary" : "secondary"} size="sm" aria-pressed={!!filters.privateOnly} onClick={() => go({ private: filters.privateOnly ? null : "1" })} className="h-10">
          <EyeOff size={14} aria-hidden /> Private feedback
        </Button>
      </div>

      {selected.size > 0 && (
        <div role="region" aria-label="Bulk actions" className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--primary)]/40 bg-[var(--bg-elevated)] px-3 py-2 shadow-[var(--shadow)]">
          <span className="text-[13.5px] font-semibold text-[var(--text)]">{selected.size} selected</span>
          <Button size="sm" loading={busy} onClick={() => void run([...selected], "approve")}>
            <Check size={14} aria-hidden /> Publish
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([...selected], "hide")}>
            Hide
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([...selected], "reject")}>
            Reject
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([...selected], "feature")}>
            Feature
          </Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([...selected], "pending")}>
            Back to pending
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run([...selected], "delete")} className="text-[var(--danger)]">
            <Trash2 size={14} aria-hidden /> Delete
          </Button>
          <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="ml-auto rounded-full p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)]">
            <X size={15} aria-hidden />
          </button>
        </div>
      )}

      {list.rows.length === 0 ? (
        <p className="rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] p-10 text-center text-[14.5px] text-[var(--text-muted)]">
          {stats.total === 0 ? "No reviews yet. They'll show up here as customers write them, or add one yourself." : "No reviews match these filters."}
        </p>
      ) : (
        <ul className="space-y-3">
          <li className="flex items-center gap-2 px-1 text-[13px] text-[var(--text-muted)]">
            <input type="checkbox" checked={allOn} onChange={() => setSelected(allOn ? new Set() : new Set(ids))} aria-label="Select all on this page" className="h-4 w-4 accent-[var(--primary)]" />
            {list.total} review{list.total === 1 ? "" : "s"}
          </li>
          {list.rows.map((r) => (
            <li key={r.id} className={cn("rounded-[var(--radius-lg)] border bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] transition-colors", selected.has(r.id) ? "border-[var(--primary)]/60" : "border-[var(--border)]/70")}>
              <div className="flex gap-3">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() =>
                    setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(r.id)) n.delete(r.id);
                      else n.add(r.id);
                      return n;
                    })
                  }
                  aria-label={`Select review by ${r.authorName}`}
                  className="mt-3 h-4 w-4 shrink-0 accent-[var(--primary)]"
                />
                <ReviewAvatar name={r.authorName} src={r.avatarUrl} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="truncate text-[15px] font-semibold text-[var(--text)]">{r.authorName}</span>
                    {r.authorRole && <span className="truncate text-[13px] text-[var(--text-subtle)]">{r.authorRole}</span>}
                    <Stars rating={r.rating} size={14} />
                    <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    {r.featured && <Badge tone="accent">Featured</Badge>}
                    {r.source === "in_app" && !r.publicConsent && <Badge tone="info">Private feedback</Badge>}
                    {r.source !== "in_app" && <Badge tone="neutral">{r.source === "manual" ? "Added by hand" : "Imported"}</Badge>}
                  </div>
                  {r.title && <p className="mt-1.5 text-[14.5px] font-semibold text-[var(--text)]">{r.title}</p>}
                  <p className={cn("mt-1 line-clamp-3 text-[14px] leading-relaxed", r.body ? "text-[var(--text-muted)]" : "italic text-[var(--text-subtle)]")}>{r.body || "No written review, rating only."}</p>
                  <p className="mt-1.5 text-[12px] text-[var(--text-subtle)]">
                    {DATE.format(r.createdAt)}
                    {r.adminReply && " · Has a team reply"}
                    {r.sourceUrl && (
                      <>
                        {" · "}
                        <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                          Source
                        </a>
                      </>
                    )}
                    {r.adminNote && ` · Note: ${r.adminNote}`}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {r.status !== "approved" && (
                      <Button size="sm" disabled={busy || (r.source === "in_app" && !r.publicConsent) || !r.body} onClick={() => void run([r.id], "approve")} title={r.source === "in_app" && !r.publicConsent ? "The author didn't agree to publish this" : !r.body ? "Add text before publishing" : undefined}>
                        <Check size={13} aria-hidden /> Publish
                      </Button>
                    )}
                    {r.status === "approved" && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([r.id], "hide")}>
                        <EyeOff size={13} aria-hidden /> Hide
                      </Button>
                    )}
                    {r.status === "pending" && (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([r.id], "reject")}>
                        Reject
                      </Button>
                    )}
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => void run([r.id], r.featured ? "unfeature" : "feature")} aria-pressed={r.featured}>
                      <Star size={13} fill={r.featured ? "currentColor" : "none"} aria-hidden /> {r.featured ? "Unfeature" : "Feature"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                      <Pencil size={13} aria-hidden /> Edit
                    </Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run([r.id], "delete")} className="text-[var(--danger)]" aria-label={`Delete review by ${r.authorName}`}>
                      <Trash2 size={13} aria-hidden />
                    </Button>
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {list.pages > 1 && (
        <nav aria-label="Pages" className="flex items-center justify-between gap-3 pt-2 text-[14px]">
          <Button variant="secondary" size="sm" disabled={list.page <= 1} onClick={() => go({ page: String(list.page - 1) })}>
            ← Newer
          </Button>
          <span className="text-[var(--text-muted)]">
            Page {list.page} of {list.pages}
          </span>
          <Button variant="secondary" size="sm" disabled={list.page >= list.pages} onClick={() => go({ page: String(list.page + 1) })}>
            Older →
          </Button>
        </nav>
      )}
    </div>
  );
}
