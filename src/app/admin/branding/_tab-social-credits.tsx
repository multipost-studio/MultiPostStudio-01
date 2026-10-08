"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Textarea } from "@/components/ui/input";
import { MAX_CREDITS, type BrandingConfig, type CreditLine } from "@/lib/branding/config";
import { moveItem, removeItem, updateItem } from "@/lib/footer/list";
import { cn } from "@/lib/utils";
import { isSafeHref } from "@/lib/footer/config";
import { SocialEditor, RowTools, bad } from "../footer/_lists";
import { Field, Panel } from "./_ui";

type Props = { draft: BrandingConfig; set: <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => void };

export function SocialTab({ draft, set }: Props) {
  return (
    <Panel
      title="Social links"
      description="Your profiles on other networks. They appear as icon buttons in the footer, and are also published to search engines as your organization's official profiles."
    >
      <SocialEditor items={draft.social} onChange={(social) => set("social", social)} />
    </Panel>
  );
}

export function CreditsTab({ draft, set }: Props) {
  const lines = draft.credits.lines;
  const setLines = (next: CreditLine[]) => set("credits", { ...draft.credits, lines: next });
  return (
    <div className="space-y-5">
      <Panel title="Footer credits" description="The text at the bottom of the footer: copyright, optional credit lines, and the legal disclaimer.">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Copyright line" hint="{year} becomes the current year.">
            <Input maxLength={160} value={draft.credits.copyright} onChange={(e) => set("credits", { ...draft.credits, copyright: e.target.value })} />
          </Field>
          <Field label="Disclaimer" hint="Shown in small print under the credits. Leave empty to hide.">
            <Textarea maxLength={500} rows={3} value={draft.credits.disclaimer} onChange={(e) => set("credits", { ...draft.credits, disclaimer: e.target.value })} />
          </Field>
        </div>
      </Panel>

      <Panel title="Built by" description='The "Built by …" credit in the bottom row of the footer. It only appears once you enter a name.'>
        <Switch checked={draft.credits.builtBy.enabled} onCheckedChange={(v) => set("credits", { ...draft.credits, builtBy: { ...draft.credits.builtBy, enabled: v } })} label="Show the Built-by row" />
        {draft.credits.builtBy.enabled && (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <Field label="Lead-in text" hint='For example "Built by" or "Website by".'>
              <Input maxLength={30} value={draft.credits.builtBy.label} onChange={(e) => set("credits", { ...draft.credits, builtBy: { ...draft.credits.builtBy, label: e.target.value } })} />
            </Field>
            <Field label="Name" hint="Your studio, agency or team.">
              <Input maxLength={60} placeholder="Your studio name" value={draft.credits.builtBy.name} onChange={(e) => set("credits", { ...draft.credits, builtBy: { ...draft.credits.builtBy, name: e.target.value } })} />
            </Field>
            <Field label="Link" hint="Optional. Makes the name clickable.">
              <Input
                aria-invalid={(draft.credits.builtBy.href.trim() !== "" && !isSafeHref(draft.credits.builtBy.href)) || undefined}
                className={cn(draft.credits.builtBy.href.trim() !== "" && !isSafeHref(draft.credits.builtBy.href) && "border-[var(--danger)]")}
                placeholder="https://"
                value={draft.credits.builtBy.href}
                onChange={(e) => set("credits", { ...draft.credits, builtBy: { ...draft.credits.builtBy, href: e.target.value } })}
              />
            </Field>
          </div>
        )}
      </Panel>

      <Panel title="Credit lines" description='Extra lines such as "Designed by …" or "Made in India". Add a link to make a line clickable.'>
        <div className="space-y-2">
          {lines.length === 0 && <p className="text-[13.5px] text-[var(--text-muted)]">No extra credit lines.</p>}
          {lines.map((l, i) => (
            <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
              <Input size="sm" aria-label="Credit text" className="w-52 min-w-0 flex-[2]" maxLength={140} placeholder="Designed by …" value={l.text} onChange={(e) => setLines(updateItem(lines, l.id, { text: e.target.value }))} />
              <Input
                size="sm"
                aria-label="Credit link (optional)"
                aria-invalid={bad(l.href) || undefined}
                className={cn("w-48 min-w-0 flex-[2]", bad(l.href) && "border-[var(--danger)]")}
                placeholder="https://… (optional)"
                value={l.href}
                onChange={(e) => setLines(updateItem(lines, l.id, { href: e.target.value }))}
              />
              <Switch checked={l.enabled} onCheckedChange={(v) => setLines(updateItem(lines, l.id, { enabled: v }))} label="Show" />
              <RowTools index={i} count={lines.length} name={l.text || "credit line"} onMove={(d) => setLines(moveItem(lines, l.id, d))} onRemove={() => setLines(removeItem(lines, l.id))} />
            </div>
          ))}
          <Button size="sm" variant="secondary" disabled={lines.length >= MAX_CREDITS} onClick={() => setLines([...lines, { id: `cr-${Math.random().toString(36).slice(2, 8)}`, text: "", href: "", enabled: true }])}>
            <Plus size={13} aria-hidden /> Add a credit line
          </Button>
        </div>
      </Panel>
    </div>
  );
}
