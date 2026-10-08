"use client";

import * as React from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Select, Textarea } from "@/components/ui/input";
import { LINK_RELS, MAX_TAGS, newTag, type BrandingConfig, type CustomTag } from "@/lib/branding/config";
import { SCRIPT_SRC_HOSTS } from "@/lib/branding/csp";
import { moveItem, removeItem, updateItem } from "@/lib/footer/list";
import { RowTools } from "../footer/_lists";
import { Field, Panel } from "./_ui";

type Props = { draft: BrandingConfig; set: <K extends keyof BrandingConfig>(key: K, value: BrandingConfig[K]) => void };

/** One-click starting points: the meta tags that prove you own the site to search engines and networks. */
const PRESETS: { label: string; key: string }[] = [
  { label: "Google Search Console", key: "google-site-verification" },
  { label: "Bing Webmaster", key: "msvalidate.01" },
  { label: "Pinterest", key: "p:domain_verify" },
  { label: "Facebook domain", key: "facebook-domain-verification" },
];

const KIND_LABEL = { meta: "Meta tag", link: "Link tag", script: "Script" } as const;

function TagFields({ tag, onChange }: { tag: CustomTag; onChange: (patch: Partial<CustomTag>) => void }) {
  if (tag.kind === "meta") {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" hint="For example google-site-verification">
          <Input size="sm" maxLength={80} value={tag.key} onChange={(e) => onChange({ key: e.target.value })} />
        </Field>
        <Field label="Value" hint="The code the service gave you.">
          <Input size="sm" maxLength={500} value={tag.content} onChange={(e) => onChange({ content: e.target.value })} />
        </Field>
      </div>
    );
  }
  if (tag.kind === "link") {
    return (
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <Field label="Relationship">
          <Select size="sm" value={tag.rel} onChange={(e) => onChange({ rel: e.target.value as CustomTag["rel"] })}>
            {LINK_RELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Address" hint="Must start with https://">
          <Input size="sm" maxLength={500} placeholder="https://" value={tag.href} onChange={(e) => onChange({ href: e.target.value })} />
        </Field>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Where">
          <Select size="sm" value={tag.placement} onChange={(e) => onChange({ placement: e.target.value as CustomTag["placement"] })}>
            <option value="head">Head (loads first)</option>
            <option value="body">End of body</option>
          </Select>
        </Field>
        <Field label="Runs">
          <Select size="sm" value={tag.consent} onChange={(e) => onChange({ consent: e.target.value as CustomTag["consent"] })}>
            <option value="analytics">After analytics consent</option>
            <option value="essential">Always (essential)</option>
          </Select>
        </Field>
      </div>
      <Field label="Script address" hint={`Hosted files are limited to: ${SCRIPT_SRC_HOSTS.join(", ")}. Leave empty to use inline code.`}>
        <Input size="sm" maxLength={500} placeholder="https://www.googletagmanager.com/gtm.js?id=…" value={tag.src} onChange={(e) => onChange({ src: e.target.value })} />
      </Field>
      <Field label="Inline code" hint="JavaScript only, no <script> tags. Use this or an address, not both.">
        <Textarea rows={4} maxLength={8000} className="font-mono text-[13px]" spellCheck={false} value={tag.code} onChange={(e) => onChange({ code: e.target.value })} />
      </Field>
    </div>
  );
}

export function TagsTab({ draft, set }: Props) {
  const tags = draft.tags;
  const setTags = (next: CustomTag[]) => set("tags", next);
  return (
    <div className="space-y-5">
      <Panel title="Custom tags" description="Add verification codes, link hints or tracking scripts to every public page without a code change.">
        <div className="mb-4 flex items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-3 text-[13px] text-[var(--text-muted)]">
          <ShieldCheck size={16} aria-hidden className="mt-0.5 shrink-0 text-[var(--success)]" />
          <p>
            Meta and link tags are written into the page itself, so search engines see them. Scripts are added in the browser and, unless you mark them essential, wait for the visitor&apos;s cookie consent. Scripts are only added on public pages (marketing and sign-in), never when a page is opened inside the signed-in app; one that was already added stays until the page reloads.
          </p>
        </div>

        <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.1em] text-[var(--text-subtle)]">Quick add</p>
        <div className="mb-5 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <Button key={p.key} size="sm" variant="secondary" disabled={tags.length >= MAX_TAGS} onClick={() => setTags([...tags, { ...newTag(), name: `${p.label} verification`, kind: "meta", key: p.key }])}>
              <Plus size={13} aria-hidden /> {p.label}
            </Button>
          ))}
        </div>

        <div className="space-y-3">
          {tags.length === 0 && <p className="text-[13.5px] text-[var(--text-muted)]">No custom tags yet.</p>}
          {tags.map((t, i) => (
            <div key={t.id} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Input size="sm" aria-label="Tag name" className="w-44 min-w-0 flex-1" placeholder="Name (for you)" maxLength={60} value={t.name} onChange={(e) => setTags(updateItem(tags, t.id, { name: e.target.value }))} />
                <Select size="sm" aria-label="Tag type" className="w-36" value={t.kind} onChange={(e) => setTags(updateItem(tags, t.id, { kind: e.target.value as CustomTag["kind"] }))}>
                  {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABEL[k]}
                    </option>
                  ))}
                </Select>
                {t.kind === "script" && <Badge tone={t.consent === "essential" ? "warning" : "success"}>{t.consent === "essential" ? "Always runs" : "Consent first"}</Badge>}
                <Switch checked={t.enabled} onCheckedChange={(v) => setTags(updateItem(tags, t.id, { enabled: v }))} label="On" />
                <RowTools index={i} count={tags.length} name={t.name || "tag"} onMove={(d) => setTags(moveItem(tags, t.id, d))} onRemove={() => setTags(removeItem(tags, t.id))} />
              </div>
              <div className="mt-3">
                <TagFields tag={t} onChange={(patch) => setTags(updateItem(tags, t.id, patch))} />
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" disabled={tags.length >= MAX_TAGS} onClick={() => setTags([...tags, newTag()])}>
            <Plus size={13} aria-hidden /> Add a tag
          </Button>
        </div>
      </Panel>
    </div>
  );
}
