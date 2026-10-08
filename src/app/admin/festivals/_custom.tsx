"use client";

import * as React from "react";
import { CalendarPlus, Eye, Plus, Sparkles, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Select } from "@/components/ui/input";
import { formatYmd, isYmd } from "@/lib/festivals/calendar";
import { FESTIVALS, FESTIVAL_BY_ID } from "@/lib/festivals/catalog";
import { MAX_CUSTOM } from "@/lib/festivals/config";
import type { CustomFestival } from "@/lib/festivals/types";
import { paletteGradient } from "./_festival-card";

const blank = (today: string): Omit<CustomFestival, "id"> => ({ name: "", themeId: FESTIVALS[0].id, startsOn: today, endsOn: today, yearly: false, message: "" });

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "event";

/** Your own dated events (a launch week, a sale, a company anniversary) dressed in any preset's look. */
export function CustomFestivals({
  items,
  today,
  liveId,
  busy,
  onChange,
  onPreview,
  onGoLive,
}: {
  items: CustomFestival[];
  today: string;
  liveId: string | null;
  busy: boolean;
  onChange: (next: CustomFestival[]) => void;
  onPreview: (themeId: string) => void;
  onGoLive: (id: string) => void;
}) {
  const [form, setForm] = React.useState(() => blank(today));
  const [error, setError] = React.useState("");

  function add() {
    const name = form.name.trim();
    if (name.length < 2) return setError("Give the event a name.");
    if (!isYmd(form.startsOn) || !isYmd(form.endsOn)) return setError("Pick a start and end date.");
    if (form.endsOn < form.startsOn) return setError("The end date is before the start date.");
    if (items.length >= MAX_CUSTOM) return setError(`You can keep up to ${MAX_CUSTOM} custom events.`);
    const id = `custom-${slug(name)}-${Math.random().toString(36).slice(2, 6)}`;
    onChange([...items, { id, ...form, name, message: form.message?.trim() || undefined }]);
    setForm(blank(today));
    setError("");
  }

  return (
    <div className="space-y-4">
      {items.length > 0 && (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
          {items.map((c) => {
            const theme = FESTIVAL_BY_ID[c.themeId];
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                <span aria-hidden className="h-8 w-1.5 shrink-0 rounded-full" style={{ background: theme ? paletteGradient(theme.colors) : undefined }} />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium text-[var(--text)]">
                    <span aria-hidden>{theme?.emoji}</span> {c.name}
                    {liveId === c.id && <Badge tone="success">Live</Badge>}
                    {c.yearly && <Badge tone="neutral">Every year</Badge>}
                  </p>
                  <p className="text-[12.5px] text-[var(--text-muted)]">
                    {formatYmd(c.startsOn)} – {formatYmd(c.endsOn)} · {theme?.name ?? "Unknown theme"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => onPreview(c.themeId)} aria-label={`Preview ${c.name}`}>
                    <Eye size={13} aria-hidden />
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => onGoLive(c.id)} aria-label={`Go live with ${c.name}`}>
                    <Sparkles size={13} aria-hidden />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => onChange(items.filter((x) => x.id !== c.id))} aria-label={`Remove ${c.name}`}>
                    <Trash2 size={13} aria-hidden />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--border-strong)] p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[13.5px] font-semibold text-[var(--text)]">
          <CalendarPlus size={15} aria-hidden /> Add your own event
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-[13px] text-[var(--text-muted)] lg:col-span-2">
            Name
            <Input size="sm" className="mt-1" maxLength={40} value={form.name} placeholder="Launch week" onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="block text-[13px] text-[var(--text-muted)] lg:col-span-2">
            Look
            <Select size="sm" className="mt-1" value={form.themeId} onChange={(e) => setForm({ ...form, themeId: e.target.value })}>
              {FESTIVALS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.emoji} {f.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block text-[13px] text-[var(--text-muted)]">
            Starts
            <Input size="sm" type="date" className="mt-1" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
          </label>
          <label className="block text-[13px] text-[var(--text-muted)]">
            Ends
            <Input size="sm" type="date" className="mt-1" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
          </label>
          <label className="block text-[13px] text-[var(--text-muted)] lg:col-span-2">
            Greeting (optional)
            <Input size="sm" className="mt-1" maxLength={120} value={form.message ?? ""} placeholder="Our biggest launch yet!" onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Switch checked={form.yearly} onCheckedChange={(v) => setForm({ ...form, yearly: v })} label="Repeat every year" />
          <Button size="sm" onClick={add} className="ml-auto">
            <Plus size={13} aria-hidden /> Add event
          </Button>
        </div>
        {error && <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">{error}</p>}
        <p className="mt-2 text-[12px] text-[var(--text-subtle)]">Added events are part of your unsaved changes. Press Save to publish them.</p>
      </div>
    </div>
  );
}
