"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Select } from "@/components/ui/input";
import { MAX_STATS, type BrandingConfig, type StatItem, type StatSource } from "@/lib/branding/config";
import { moveItem, removeItem, updateItem } from "@/lib/footer/list";
import { resolveStats, type StatCounts } from "@/lib/branding/stats";
import { RowTools } from "../footer/_lists";
import { Field, Panel } from "./_ui";

type Props = { draft: BrandingConfig; set: <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => void; counts: StatCounts };

const SOURCE_LABEL: Record<StatSource, string> = {
  users: "Registered users",
  posts_published: "Posts published",
  workspaces: "Workspaces",
  channels: "Connected accounts",
  platforms: "Platforms supported",
  manual: "Type my own value",
};

export function StatsTab({ draft, set, counts }: Props) {
  const stats = draft.stats;
  const items = stats.items;
  const setItems = (next: StatItem[]) => set("stats", { ...stats, items: next });
  const preview = resolveStats({ ...stats, enabled: true }, counts);

  return (
    <div className="space-y-5">
      <Panel title="Platform stats" description="A strip of numbers on the home page. Automatic numbers are counted from your live database, so they can never drift from the truth.">
        <Switch checked={stats.enabled} onCheckedChange={(v) => set("stats", { ...stats, enabled: v })} label="Show the stats strip on the home page" />
        <div className="mt-4 max-w-md">
          <Field label="Heading">
            <Input maxLength={80} value={stats.title} onChange={(e) => set("stats", { ...stats, title: e.target.value })} />
          </Field>
        </div>

        <div className="mt-5 space-y-2">
          {items.map((s, i) => {
            const live = s.source === "manual" ? undefined : counts[s.source];
            return (
              <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
                <Input size="sm" aria-label="Stat label" className="w-40 min-w-0 flex-1" maxLength={40} placeholder="Label" value={s.label} onChange={(e) => setItems(updateItem(items, s.id, { label: e.target.value }))} />
                <Select size="sm" aria-label="Where the number comes from" className="w-44" value={s.source} onChange={(e) => setItems(updateItem(items, s.id, { source: e.target.value as StatSource }))}>
                  {(Object.keys(SOURCE_LABEL) as StatSource[]).map((k) => (
                    <option key={k} value={k}>
                      {SOURCE_LABEL[k]}
                    </option>
                  ))}
                </Select>
                {s.source === "manual" ? (
                  <Input size="sm" aria-label="Value" className="w-28" maxLength={20} placeholder="99.9%" value={s.manualValue} onChange={(e) => setItems(updateItem(items, s.id, { manualValue: e.target.value }))} />
                ) : (
                  <>
                    <span className="w-28 text-[12.5px] text-[var(--text-muted)]">Now: {typeof live === "number" ? live.toLocaleString("en-US") : "unavailable"}</span>
                    <Input size="sm" type="number" min={0} aria-label="Hide until it reaches" title="Hide until it reaches" className="w-24" placeholder="Min" value={s.minimum || ""} onChange={(e) => setItems(updateItem(items, s.id, { minimum: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))} />
                  </>
                )}
                <Input size="sm" aria-label="Suffix" className="w-16" maxLength={4} placeholder="+" value={s.suffix} onChange={(e) => setItems(updateItem(items, s.id, { suffix: e.target.value }))} />
                <Switch checked={s.enabled} onCheckedChange={(v) => setItems(updateItem(items, s.id, { enabled: v }))} label="Show" />
                <RowTools index={i} count={items.length} name={s.label || "stat"} onMove={(d) => setItems(moveItem(items, s.id, d))} onRemove={() => setItems(removeItem(items, s.id))} />
              </div>
            );
          })}
          <Button size="sm" variant="secondary" disabled={items.length >= MAX_STATS} onClick={() => setItems([...items, { id: `st-${Math.random().toString(36).slice(2, 8)}`, label: "", source: "users", manualValue: "", suffix: "+", minimum: 0, enabled: true }])}>
            <Plus size={13} aria-hidden /> Add a stat
          </Button>
        </div>
        <p className="mt-3 text-[12.5px] text-[var(--text-subtle)]">&quot;Hide until it reaches&quot; keeps a small number from showing: a stat below its minimum is left out, and numbers always round down.</p>
      </Panel>

      <Panel title="What visitors will see" description={stats.enabled ? "Built from your live numbers right now." : "The strip is switched off, so nothing shows on the site. This is what it would look like."}>
        {preview ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-sunken)] px-4 py-8">
            {preview.title && <p className="text-center text-[12px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">{preview.title}</p>}
            <dl className="mt-5 grid grid-cols-2 gap-y-6 sm:grid-cols-[repeat(auto-fit,minmax(140px,1fr))]">
              {preview.items.map((s) => (
                <div key={s.id} className="px-2 text-center">
                  <dd className="text-[32px] font-extrabold leading-none tracking-tight text-[var(--primary)] tabular-nums">{s.value}</dd>
                  <dt className="mt-2 text-[13.5px] text-[var(--text-muted)]">{s.label}</dt>
                </div>
              ))}
            </dl>
          </div>
        ) : (
          <p className="text-[13.5px] text-[var(--text-muted)]">Nothing qualifies yet: every stat is switched off, below its minimum, or has no value. The strip stays hidden until at least one does.</p>
        )}
      </Panel>
    </div>
  );
}
