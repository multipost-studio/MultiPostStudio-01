import { z } from "zod";

/**
 * The marketing footer's settings. Admin-editable, stored as one JSON row in
 * SystemSetting (no migration). The five standard link columns stay live from
 * Content (CMS) so the header and footer never disagree; admins can hide any of
 * those links, add extras, and build custom columns, social icons and app links.
 */

export const MAX_COLUMNS = 12;
export const MAX_LINKS = 24;
export const MAX_APPS = 8;
export const MAX_BOTTOM = 8;
export const MAX_IMPORT_BYTES = 60_000;

export const NAV_SOURCES = ["product", "solution", "resource", "company", "legal"] as const;
export type NavSource = (typeof NAV_SOURCES)[number];
/** Lists built from the site's own pages (platforms, comparisons…): they grow as the site does. */
export const AUTO_SOURCES = ["features", "usecases", "platforms", "compare", "tools", "guides"] as const;
export type AutoSource = (typeof AUTO_SOURCES)[number];
export type ListSource = NavSource | AutoSource;
export type ColumnSource = ListSource | "custom";
export const COLUMN_SOURCES = [...NAV_SOURCES, ...AUTO_SOURCES, "custom"] as const;

export const APP_ICONS = ["web", "mobile", "api", "docs", "status", "community", "store", "globe"] as const;
export type AppIcon = (typeof APP_ICONS)[number];

export type FooterLink = { id: string; label: string; href: string; newTab: boolean; enabled: boolean };
export type FooterColumn = {
  id: string;
  title: string;
  enabled: boolean;
  source: ColumnSource;
  /** For a CMS column: hrefs to leave out. */
  hidden: string[];
  /** CMS column: extra links after the live ones. Custom column: all of its links. */
  links: FooterLink[];
};
export type AppLink = { id: string; label: string; description: string; href: string; icon: AppIcon; newTab: boolean; enabled: boolean };

export type FooterConfig = {
  tagline: string;
  contact: { email: string; phone: string; address: string };
  cta: { enabled: boolean; title: string; label: string; href: string };
  columns: FooterColumn[];
  apps: { title: string; items: AppLink[] };
  bottomLinks: FooterLink[];
  wordmark: { enabled: boolean; primary: string; secondary: string };
};

/** Only links that cannot run script: site paths, anchors, http(s), mail and phone. */
export function isSafeHref(href: string): boolean {
  const v = href.trim();
  if (!v || v.length > 500 || /[\u0000-\u001f]/.test(v)) return false;
  if (v.startsWith("//")) return false;
  if (v.startsWith("/") || v.startsWith("#")) return !/\s/.test(v);
  // Phone numbers may contain spaces; nothing else may.
  return /^(https?:\/\/[^\s/]+\S*|mailto:[^\s@]+@[^\s@]+|tel:\+?[\d\s().-]{5,})$/i.test(v);
}

const link = (id: string, label: string, href: string): FooterLink => ({ id, label, href, newTab: false, enabled: true });

export const DEFAULT_FOOTER_CONFIG: FooterConfig = {
  tagline: "The AI-powered social media operating system.",
  contact: { email: "", phone: "", address: "" },
  cta: { enabled: true, title: "Run your whole social workflow in one place.", label: "Start free", href: "/signup" },
  columns: [
    { id: "col-product", title: "Product", enabled: true, source: "product", hidden: [], links: [link("x-pricing", "Pricing", "/pricing")] },
    { id: "col-solutions", title: "Solutions", enabled: true, source: "solution", hidden: [], links: [] },
    { id: "col-usecases", title: "Use cases", enabled: true, source: "usecases", hidden: [], links: [] },
    { id: "col-platforms", title: "Platforms", enabled: true, source: "platforms", hidden: [], links: [] },
    { id: "col-compare", title: "Compare", enabled: true, source: "compare", hidden: [], links: [] },
    { id: "col-resources", title: "Resources", enabled: true, source: "resource", hidden: [], links: [] },
    { id: "col-company", title: "Company", enabled: true, source: "company", hidden: [], links: [link("x-partners", "Affiliate program", "/legal/affiliate-terms")] },
    {
      id: "col-legal",
      title: "Legal",
      enabled: true,
      source: "legal",
      hidden: [],
      links: [link("x-affiliate", "Affiliate terms", "/legal/affiliate-terms"), link("x-deletion", "Data deletion", "/legal/data-deletion"), link("x-sitemap", "Sitemap", "/sitemap")],
    },
  ],
  apps: {
    title: "More from MultiPost",
    items: [
      { id: "app-web", label: "Web app", description: "Open your workspace", href: "https://app.multipoststudio.online", icon: "web", newTab: false, enabled: true },
      { id: "app-tools", label: "Free tools", description: "Generators and calculators", href: "/tools", icon: "api", newTab: false, enabled: true },
      { id: "app-status", label: "System status", description: "Live service health", href: "/status", icon: "status", newTab: false, enabled: true },
      { id: "app-community", label: "Community", description: "Requests and what's shipping", href: "/community", icon: "community", newTab: false, enabled: true },
    ],
  },
  bottomLinks: [link("b-status", "Status", "/status"), link("b-security", "Security", "/security"), link("b-contact", "Contact", "/contact")],
  wordmark: { enabled: true, primary: "MultiPost", secondary: "Studio" },
};

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Bad id");
const text = (max: number) => z.string().trim().max(max);
const href = z.string().trim().refine(isSafeHref, "Use a site path, https:// link, mailto: or tel:");

const linkSchema = z.object({ id, label: text(60).min(1, "Give the link a label"), href, newTab: z.boolean(), enabled: z.boolean() });
const columnSchema = z.object({
  id,
  title: text(40).min(1, "Give the column a title"),
  enabled: z.boolean(),
  source: z.enum(COLUMN_SOURCES),
  hidden: z.array(z.string().max(500)).max(60),
  links: z.array(linkSchema).max(MAX_LINKS),
});
const appSchema = z.object({
  id,
  label: text(40).min(1, "Give the app a name"),
  description: text(80),
  href,
  icon: z.enum(APP_ICONS),
  newTab: z.boolean(),
  enabled: z.boolean(),
});

const unique = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

export const footerConfigSchema = z
  .object({
    tagline: text(140),
    contact: z.object({ email: text(120), phone: text(40), address: text(200) }),
    cta: z.object({ enabled: z.boolean(), title: text(100), label: text(30), href }),
    columns: z.array(columnSchema).max(MAX_COLUMNS),
    apps: z.object({ title: text(40), items: z.array(appSchema).max(MAX_APPS) }),
    bottomLinks: z.array(linkSchema).max(MAX_BOTTOM),
    wordmark: z.object({ enabled: z.boolean(), primary: text(24), secondary: text(24) }),
  })
  .refine((c) => unique(c.columns) && c.columns.every((col) => unique(col.links)), { message: "Duplicate id in link columns", path: ["columns"] })
  .refine((c) => unique(c.apps.items) && unique(c.bottomLinks), { message: "Duplicate id in links", path: ["apps"] })
  .refine((c) => !c.contact.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.contact.email), { message: "Enter a valid email address", path: ["contact", "email"] });

export type ParseResult = { ok: true; config: FooterConfig } | { ok: false; errors: string[] };

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Fills anything missing from the defaults, so a partial import (or an older saved row) stays valid. */
function withDefaults(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const i = input as Record<string, unknown>;
  const d = DEFAULT_FOOTER_CONFIG;
  return {
    ...d,
    ...i,
    contact: { ...d.contact, ...obj(i.contact) },
    cta: { ...d.cta, ...obj(i.cta) },
    apps: { ...d.apps, ...obj(i.apps) },
    wordmark: { ...d.wordmark, ...obj(i.wordmark) },
  };
}

/** Strict parse for saving and importing: every problem is reported, nothing is silently dropped. */
export function parseFooterConfig(input: unknown): ParseResult {
  const res = footerConfigSchema.safeParse(withDefaults(input));
  if (res.success) return { ok: true, config: res.data as FooterConfig };
  return { ok: false, errors: res.error.issues.slice(0, 8).map((e) => `${e.path.join(".") || "footer"}: ${e.message}`) };
}

/** Lenient read for rendering: a damaged row falls back to the defaults, never a broken page. */
export function normalizeFooterConfig(input: unknown): FooterConfig {
  const r = parseFooterConfig(input);
  return r.ok ? r.config : DEFAULT_FOOTER_CONFIG;
}

/** A new, unused id for an item an admin just added. */
export function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}
