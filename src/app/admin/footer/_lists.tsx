"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/controls";
import { Input, Select } from "@/components/ui/input";
import { MAX_SOCIAL, type SocialLink } from "@/lib/branding/config";
import {
  APP_ICONS,
  MAX_APPS,
  MAX_COLUMNS,
  MAX_LINKS,
  isSafeHref,
  newId,
  type AppLink,
  type FooterColumn,
  type FooterLink,
} from "@/lib/footer/config";
import { SOCIAL_ICONS, SOCIAL_ICON_IDS, type SocialIconId } from "@/lib/footer/icons";
import { moveItem, removeItem, toggleHidden, updateItem } from "@/lib/footer/list";
import type { NavLists } from "@/lib/footer/resolve";
import { cn } from "@/lib/utils";

const NAV_LABEL = {
  product: "Product",
  solution: "Solutions",
  resource: "Resources",
  company: "Company",
  legal: "Legal",
  features: "All features",
  usecases: "Use cases",
  platforms: "Platforms",
  compare: "Comparisons",
  tools: "Free tools",
  guides: "Guides",
} as const;
/** Menus that also feed the header are edited in Content (CMS); the rest build themselves from the site's pages. */
const AUTO = new Set(["features", "usecases", "platforms", "compare", "tools", "guides"]);

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--ring)] disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function RowTools({ index, count, onMove, onRemove, name }: { index: number; count: number; onMove: (d: -1 | 1) => void; onRemove: () => void; name: string }) {
  return (
    <div className="flex shrink-0 items-center">
      <IconBtn label={`Move ${name} up`} disabled={index === 0} onClick={() => onMove(-1)}>
        <ChevronUp size={16} aria-hidden />
      </IconBtn>
      <IconBtn label={`Move ${name} down`} disabled={index === count - 1} onClick={() => onMove(1)}>
        <ChevronDown size={16} aria-hidden />
      </IconBtn>
      <IconBtn label={`Remove ${name}`} onClick={onRemove}>
        <Trash2 size={15} aria-hidden />
      </IconBtn>
    </div>
  );
}

export const bad = (href: string) => href.trim() !== "" && !isSafeHref(href);

/** Plain links: label, address, new-tab and on/off. */
export function LinkList({ links, onChange, max = MAX_LINKS, noun = "link" }: { links: FooterLink[]; onChange: (next: FooterLink[]) => void; max?: number; noun?: string }) {
  return (
    <div className="space-y-2">
      {links.map((l, i) => (
        <div key={l.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
          <Input size="sm" aria-label="Link label" className="w-36 min-w-0 flex-1" placeholder="Label" maxLength={60} value={l.label} onChange={(e) => onChange(updateItem(links, l.id, { label: e.target.value }))} />
          <Input
            size="sm"
            aria-label="Link address"
            aria-invalid={bad(l.href) || undefined}
            className={cn("w-48 min-w-0 flex-[2]", bad(l.href) && "border-[var(--danger)]")}
            placeholder="/page or https://…"
            value={l.href}
            onChange={(e) => onChange(updateItem(links, l.id, { href: e.target.value }))}
          />
          <Switch checked={l.newTab} onCheckedChange={(v) => onChange(updateItem(links, l.id, { newTab: v }))} label="New tab" />
          <Switch checked={l.enabled} onCheckedChange={(v) => onChange(updateItem(links, l.id, { enabled: v }))} label="Show" />
          <RowTools index={i} count={links.length} name={l.label || noun} onMove={(d) => onChange(moveItem(links, l.id, d))} onRemove={() => onChange(removeItem(links, l.id))} />
        </div>
      ))}
      <Button size="sm" variant="secondary" disabled={links.length >= max} onClick={() => onChange([...links, { id: newId("l"), label: "", href: "", newTab: false, enabled: true }])}>
        <Plus size={13} aria-hidden /> Add {noun}
      </Button>
    </div>
  );
}

/** Columns: reorder, rename, switch off, hide live CMS links, add extras, build custom columns. */
export function ColumnsEditor({ columns, nav, onChange }: { columns: FooterColumn[]; nav: NavLists; onChange: (next: FooterColumn[]) => void }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      {columns.map((c, i) => {
        const live = c.source === "custom" ? [] : nav[c.source];
        const isOpen = open === c.id;
        return (
          <div key={c.id} className={cn("rounded-[var(--radius-lg)] border bg-[var(--surface)]", c.enabled ? "border-[var(--border)]" : "border-dashed border-[var(--border-strong)] opacity-80")}>
            <div className="flex flex-wrap items-center gap-2 p-3">
              <Input size="sm" aria-label="Column title" className="w-40 min-w-0 flex-1" maxLength={40} value={c.title} onChange={(e) => onChange(updateItem(columns, c.id, { title: e.target.value }))} />
              {c.source === "custom" ? <Badge tone="neutral">Custom</Badge> : <Badge tone="info">Live: {NAV_LABEL[c.source]}</Badge>}
              <span className="text-[12.5px] text-[var(--text-subtle)]">{c.source === "custom" ? c.links.length : live.length - c.hidden.filter((h) => live.some((l) => l.href === h)).length + c.links.length} links</span>
              <div className="ml-auto flex items-center gap-1">
                <Switch checked={c.enabled} onCheckedChange={(v) => onChange(updateItem(columns, c.id, { enabled: v }))} label="Show" />
                <Button size="sm" variant="ghost" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.id)}>
                  {isOpen ? "Close" : "Edit links"}
                </Button>
                <RowTools index={i} count={columns.length} name={c.title || "column"} onMove={(d) => onChange(moveItem(columns, c.id, d))} onRemove={() => onChange(removeItem(columns, c.id))} />
              </div>
            </div>
            {isOpen && (
              <div className="space-y-4 border-t border-[var(--border)] p-3">
                {c.source !== "custom" && (
                  <div>
                    <p className="mb-1 text-[13px] font-semibold text-[var(--text)]">{AUTO.has(c.source) ? "Links built from your pages" : "Links from Content (CMS)"}</p>
                    <p className="mb-2 text-[12.5px] text-[var(--text-muted)]">
                      {AUTO.has(c.source)
                        ? "This list grows by itself as pages are added. Untick any you don't want in the footer."
                        : "These also feed the header menus, so edit them under Content (CMS). Untick any you don't want in the footer."}
                    </p>
                    <ul className="grid gap-1.5 sm:grid-cols-2">
                      {live.map((l) => (
                        <li key={l.href}>
                          <label className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] px-2 py-1 text-[13.5px] hover:bg-[var(--surface-hover)]">
                            <input type="checkbox" checked={!c.hidden.includes(l.href)} onChange={(e) => onChange(updateItem(columns, c.id, { hidden: toggleHidden(c.hidden, l.href, e.target.checked) }))} className="h-4 w-4 accent-[var(--primary)]" />
                            <span className="min-w-0 flex-1 truncate text-[var(--text)]">{l.label}</span>
                            <span className="truncate text-[12px] text-[var(--text-subtle)]">{l.href}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-[13px] font-semibold text-[var(--text)]">{c.source === "custom" ? "Links" : "Extra links in this column"}</p>
                  <LinkList links={c.links} onChange={(links) => onChange(updateItem(columns, c.id, { links }))} />
                </div>
              </div>
            )}
          </div>
        );
      })}
      <Button
        size="sm"
        variant="secondary"
        disabled={columns.length >= MAX_COLUMNS}
        onClick={() => {
          const id = newId("col");
          onChange([...columns, { id, title: "New column", enabled: true, source: "custom", hidden: [], links: [] }]);
          setOpen(id);
        }}
      >
        <Plus size={13} aria-hidden /> Add a column
      </Button>
    </div>
  );
}

/** Social icons: pick the brand, name it, paste the profile address. */
export function SocialEditor({ items, onChange }: { items: SocialLink[]; onChange: (next: SocialLink[]) => void }) {
  return (
    <div className="space-y-2">
      {items.length === 0 && <p className="text-[13.5px] text-[var(--text-muted)]">No social icons yet. Add one and it appears under the tagline in the footer.</p>}
      {items.map((s, i) => (
        <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
          <Select
            size="sm"
            aria-label="Icon"
            className="w-40"
            value={s.icon}
            onChange={(e) => {
              const icon = e.target.value as SocialIconId;
              const wasDefaultName = s.label === "" || s.label === SOCIAL_ICONS[s.icon].label;
              onChange(updateItem(items, s.id, { icon, ...(wasDefaultName ? { label: SOCIAL_ICONS[icon].label } : {}) }));
            }}
          >
            {SOCIAL_ICON_IDS.map((id) => (
              <option key={id} value={id}>
                {SOCIAL_ICONS[id].label}
              </option>
            ))}
          </Select>
          <Input size="sm" aria-label="Accessible name" className="w-32 min-w-0 flex-1" placeholder="Name" maxLength={40} value={s.label} onChange={(e) => onChange(updateItem(items, s.id, { label: e.target.value }))} />
          <Input
            size="sm"
            aria-label="Profile address"
            aria-invalid={bad(s.href) || undefined}
            className={cn("w-56 min-w-0 flex-[2]", bad(s.href) && "border-[var(--danger)]")}
            placeholder={s.icon === "email" ? "mailto:hello@example.com" : "https://…"}
            value={s.href}
            onChange={(e) => onChange(updateItem(items, s.id, { href: e.target.value }))}
          />
          <Switch checked={s.enabled} onCheckedChange={(v) => onChange(updateItem(items, s.id, { enabled: v }))} label="Show" />
          <RowTools index={i} count={items.length} name={s.label || "icon"} onMove={(d) => onChange(moveItem(items, s.id, d))} onRemove={() => onChange(removeItem(items, s.id))} />
        </div>
      ))}
      <Button size="sm" variant="secondary" disabled={items.length >= MAX_SOCIAL} onClick={() => onChange([...items, { id: newId("s"), icon: "instagram", label: "Instagram", href: "", enabled: true }])}>
        <Plus size={13} aria-hidden /> Add a social icon
      </Button>
    </div>
  );
}

/** "More from MultiPost": cards linking to your other web apps and destinations. */
export function AppsEditor({ items, onChange }: { items: AppLink[]; onChange: (next: AppLink[]) => void }) {
  return (
    <div className="space-y-2">
      {items.map((a, i) => (
        <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2">
          <Select size="sm" aria-label="Card icon" className="w-28" value={a.icon} onChange={(e) => onChange(updateItem(items, a.id, { icon: e.target.value as AppLink["icon"] }))}>
            {APP_ICONS.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </Select>
          <Input size="sm" aria-label="App name" className="w-32 min-w-0 flex-1" placeholder="Name" maxLength={40} value={a.label} onChange={(e) => onChange(updateItem(items, a.id, { label: e.target.value }))} />
          <Input size="sm" aria-label="Short description" className="w-40 min-w-0 flex-1" placeholder="Short description" maxLength={80} value={a.description} onChange={(e) => onChange(updateItem(items, a.id, { description: e.target.value }))} />
          <Input
            size="sm"
            aria-label="App address"
            aria-invalid={bad(a.href) || undefined}
            className={cn("w-52 min-w-0 flex-[2]", bad(a.href) && "border-[var(--danger)]")}
            placeholder="https://app.example.com"
            value={a.href}
            onChange={(e) => onChange(updateItem(items, a.id, { href: e.target.value }))}
          />
          <Switch checked={a.newTab} onCheckedChange={(v) => onChange(updateItem(items, a.id, { newTab: v }))} label="New tab" />
          <Switch checked={a.enabled} onCheckedChange={(v) => onChange(updateItem(items, a.id, { enabled: v }))} label="Show" />
          <RowTools index={i} count={items.length} name={a.label || "app"} onMove={(d) => onChange(moveItem(items, a.id, d))} onRemove={() => onChange(removeItem(items, a.id))} />
        </div>
      ))}
      <Button size="sm" variant="secondary" disabled={items.length >= MAX_APPS} onClick={() => onChange([...items, { id: newId("app"), label: "", description: "", href: "", icon: "globe", newTab: true, enabled: true }])}>
        <Plus size={13} aria-hidden /> Add an app or link
      </Button>
    </div>
  );
}
