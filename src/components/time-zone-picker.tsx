"use client";

import * as React from "react";
import { Check, ChevronDown, Globe, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { allTimezones, isValidTimezone } from "@/lib/timezones";
import { gmtLabel, tzCity, tzRegion } from "@/lib/tz-math";

/**
 * Time zone picker, laid out like Buffer's: the current zone on the button (city name), and a panel with a search box, a few
 * suggestions (what is selected, this device, the person's profile and workspace zones) and every time zone the browser knows,
 * each with its current offset (daylight saving included). The list is the browser's own, never a made-up one.
 */

export type ZoneRow = { tz: string; city: string; region: string; gmt: string; minutes: number };

/** Every known zone with its offset as of `at`, sorted from the west to the east, then by name. */
export function zoneRows(at: Date = new Date(), zones: string[] = allTimezones()): ZoneRow[] {
  return zones
    .filter(isValidTimezone)
    .map((tz) => {
      const gmt = gmtLabel(tz, at);
      const m = gmt.match(/GMT([+-])(\d+)(?::(\d+))?/);
      const minutes = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] ?? 0)) : 0;
      return { tz, city: tzCity(tz), region: tzRegion(tz), gmt, minutes };
    })
    .sort((a, b) => a.minutes - b.minutes || a.city.localeCompare(b.city));
}

/** Rows that match what was typed: part of the city, region or zone name, or an offset like "+5:30" or "gmt-8". */
export function filterZones(rows: ZoneRow[], query: string): ZoneRow[] {
  const q = query.trim().toLowerCase().replace(/_/g, " ");
  if (!q) return rows;
  const offsetQuery = q.replace(/^gmt|^utc/, "").trim();
  return rows.filter((r) => {
    if (r.city.toLowerCase().includes(q) || r.region.toLowerCase().includes(q) || r.tz.toLowerCase().replace(/_/g, " ").includes(q)) return true;
    const gmt = r.gmt.toLowerCase().replace("gmt", "");
    return offsetQuery !== "" && /^[+-]?\d/.test(offsetQuery) && gmt.includes(offsetQuery.replace(/^([0-9])/, "+$1")) ;
  });
}

export function TimeZonePicker({
  value,
  onChange,
  deviceZone,
  suggestions = [],
  className,
}: {
  value: string;
  /** Called with the zone name, or null for "back to this device's zone". */
  onChange: (tz: string | null) => void;
  deviceZone: string;
  /** Extra zones worth offering, like the person's profile zone: [zone, what it is]. */
  suggestions?: [string, string][];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const ref = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const id = React.useId();

  React.useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Offsets are as of the moment it opens, so a zone that changed its clocks this week shows the right one.
  const rows = React.useMemo(() => (open ? zoneRows() : []), [open]);
  const shown = React.useMemo(() => filterZones(rows, query), [rows, query]);

  const suggested = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { tz: string; note: string }[] = [];
    const add = (tz: string, note: string) => {
      if (!isValidTimezone(tz) || seen.has(tz)) return;
      seen.add(tz);
      out.push({ tz, note });
    };
    add(value, "Selected");
    add(deviceZone, "Your device");
    for (const [tz, note] of suggestions) add(tz, note);
    return out;
  }, [value, deviceZone, suggestions]);

  const pick = (tz: string) => {
    onChange(tz === deviceZone ? null : tz);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        title={`Times are shown in ${value}`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[13px] font-medium text-[var(--text)] transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
      >
        <Globe size={14} aria-hidden="true" className="text-[var(--text-subtle)]" />
        {tzCity(value)}
        <ChevronDown size={13} aria-hidden="true" className="text-[var(--text-subtle)]" />
      </button>

      {open && (
        <div id={id} role="dialog" aria-label="Choose a time zone" className="absolute right-0 top-full z-50 mt-1.5 w-[320px] max-w-[calc(100vw-2rem)] rounded-[var(--radius-lg)] border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-2 shadow-lg">
          <div className="relative">
            <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cities or timezones"
              aria-label="Search cities or time zones"
              className="h-9 w-full rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] pl-8 pr-2 text-[13px] text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
            />
          </div>

          <div className="mt-2 max-h-[320px] overflow-y-auto pr-0.5">
            {query.trim() === "" && (
              <>
                <p className="px-2 pb-1 pt-1 text-[11.5px] font-semibold text-[var(--text-subtle)]">Suggestions</p>
                <ul role="listbox" aria-label="Suggested time zones">
                  {suggested.map((s) => (
                    <Option key={s.tz} tz={s.tz} selected={s.tz === value} note={s.note === "Selected" ? undefined : s.note} onPick={pick} />
                  ))}
                </ul>
                <div className="my-1.5 border-t border-[var(--border)]" />
                <p className="px-2 pb-1 text-[11.5px] font-semibold text-[var(--text-subtle)]">All time zones</p>
              </>
            )}
            <ul role="listbox" aria-label="All time zones">
              {shown.map((r) => (
                <Option key={r.tz} tz={r.tz} gmt={r.gmt} region={r.region} selected={r.tz === value} onPick={pick} />
              ))}
            </ul>
            {shown.length === 0 && <p className="px-2 py-4 text-center text-[13px] text-[var(--text-muted)]">No time zone matches &ldquo;{query.trim()}&rdquo;.</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function Option({ tz, gmt, region, note, selected, onPick }: { tz: string; gmt?: string; region?: string; note?: string; selected: boolean; onPick: (tz: string) => void }) {
  return (
    <li role="option" aria-selected={selected}>
      <button
        type="button"
        onClick={() => onPick(tz)}
        className={cn("flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]", selected && "bg-[var(--surface-hover)]")}
      >
        <span className="grid w-4 shrink-0 place-items-center text-[var(--primary)]">{selected && <Check size={14} aria-hidden="true" />}</span>
        <span className="min-w-0 flex-1 truncate">
          <span className="font-medium text-[var(--text)]">{tzCity(tz)}</span> <span className="text-[var(--text-subtle)]">({gmt ?? gmtLabel(tz)})</span>
        </span>
        {(note || region) && <span className="shrink-0 text-[11.5px] text-[var(--text-subtle)]">{note ?? region}</span>}
      </button>
    </li>
  );
}
