"use client";

import * as React from "react";
import { ChevronDown, Eye, Radio, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input } from "@/components/ui/input";
import { formatYmd } from "@/lib/festivals/calendar";
import { TABLE_YEARS } from "@/lib/festivals/catalog";
import type { Festival, FestivalOverride } from "@/lib/festivals/types";
import { cn } from "@/lib/utils";

export type Occurrence = { date: string; startsOn: string; endsOn: string } | null;

export function paletteGradient(colors: string[]): string {
  return `linear-gradient(90deg, ${colors.join(", ")})`;
}

/** One preset festival: its look, when it next runs, and the per-festival controls. */
export function FestivalCard({
  festival,
  override,
  next,
  live,
  busy,
  onPatch,
  onPreview,
  onGoLive,
}: {
  festival: Festival;
  override: FestivalOverride | undefined;
  next: Occurrence;
  /** Currently live, and whether by manual choice. */
  live: null | "manual" | "custom" | "auto";
  busy: boolean;
  onPatch: (patch: Partial<FestivalOverride>) => void;
  onPreview: () => void;
  onGoLive: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const auto = override?.auto !== false;
  const year = next ? Number(next.date.slice(0, 4)) : null;
  const outsideTable = festival.rule.kind === "table" && !next;

  const num = (raw: string): number | undefined => (raw === "" ? undefined : Math.max(0, Math.min(30, Math.floor(Number(raw)))));

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-[var(--radius-lg)] border bg-[var(--surface)] shadow-[var(--shadow-card)] transition-shadow", live ? "border-[var(--primary)]" : "border-[var(--border)]/70")}>
      <div aria-hidden className="h-1.5" style={{ background: paletteGradient(festival.colors) }} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden className="text-[26px] leading-none">{festival.emoji}</span>
            <div className="min-w-0">
              <h3 className="truncate text-[16px] font-semibold text-[var(--text)]">{festival.name}</h3>
              <p className="text-[12.5px] text-[var(--text-subtle)]">{festival.region}</p>
            </div>
          </div>
          {live ? (
            <Badge tone="success">
              <Radio size={11} aria-hidden /> Live
            </Badge>
          ) : null}
        </div>

        <p className="text-[13.5px] text-[var(--text-muted)]">{festival.blurb}</p>

        <div className="rounded-[var(--radius-md)] bg-[var(--bg-sunken)] px-3 py-2 text-[13px]">
          {next ? (
            <>
              <p className="text-[var(--text)]">
                <span className="font-medium">{formatYmd(next.date)}</span>
                {festival.approximate && !override?.dateOverride && <span className="ml-1.5 text-[var(--warning)]">· approximate</span>}
                {override?.dateOverride && <span className="ml-1.5 text-[var(--info)]">· your date</span>}
              </p>
              <p className="text-[var(--text-muted)]">
                Runs {formatYmd(next.startsOn)} – {formatYmd(next.endsOn)}
              </p>
            </>
          ) : (
            <p className="text-[var(--text-muted)]">
              {outsideTable ? `No date on file after ${TABLE_YEARS.to}. Set one under Customize.` : "No upcoming date."}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-3">
          <Switch checked={auto} onCheckedChange={(v) => onPatch({ auto: v ? undefined : false })} srLabel={`Auto-enable ${festival.name}`} />
          <span className="min-w-0 flex-1 text-[13px] text-[var(--text-muted)]">Auto-enable by calendar</span>
        </div>

        <div className="mt-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onPreview}>
            <Eye size={13} aria-hidden /> Preview
          </Button>
          <Button size="sm" variant={live === "manual" ? "outline" : "primary"} onClick={onGoLive} disabled={busy || live === "manual"}>
            <Sparkles size={13} aria-hidden /> {live === "manual" ? "Live now" : "Go live"}
          </Button>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="ml-auto inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            Customize <ChevronDown size={14} aria-hidden className={cn("transition-transform", open && "rotate-180")} />
          </button>
        </div>

        {open && (
          <div className="space-y-3 border-t border-[var(--border)] pt-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[13px] text-[var(--text-muted)]">
                Days before
                <Input size="sm" type="number" min={0} max={30} inputMode="numeric" className="mt-1" value={override?.before ?? ""} placeholder={String(festival.before)} onChange={(e) => onPatch({ before: num(e.target.value) })} />
              </label>
              <label className="block text-[13px] text-[var(--text-muted)]">
                Days after
                <Input size="sm" type="number" min={0} max={30} inputMode="numeric" className="mt-1" value={override?.after ?? ""} placeholder={String(festival.after)} onChange={(e) => onPatch({ after: num(e.target.value) })} />
              </label>
            </div>
            <label className="block text-[13px] text-[var(--text-muted)]">
              Greeting
              <Input size="sm" className="mt-1" maxLength={120} value={override?.message ?? ""} placeholder={festival.greeting} onChange={(e) => onPatch({ message: e.target.value || undefined })} />
            </label>
            <label className="block text-[13px] text-[var(--text-muted)]">
              Festival date{year ? ` in ${year}` : ""}
              <Input size="sm" type="date" className="mt-1" value={override?.dateOverride ?? ""} onChange={(e) => onPatch({ dateOverride: e.target.value || undefined })} />
              <span className="mt-1 block text-[12px] text-[var(--text-subtle)]">
                {festival.approximate ? "Moon-based dates can move by a day. Set the exact date for the year to be sure." : "Leave empty to use the standard date."}
              </span>
            </label>
          </div>
        )}
      </div>
    </div>
  );
}
