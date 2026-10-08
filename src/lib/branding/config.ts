import { z } from "zod";
import { isSafeHref } from "@/lib/footer/config";
import { SOCIAL_ICON_IDS, type SocialIconId } from "@/lib/footer/icons";
import { SCRIPT_SRC_HOSTS } from "./csp";

/**
 * Site Branding: everything an admin controls about how the public site presents
 * itself, in one settings row. Social links, footer credits, custom tags, the share
 * image, invoice details and the public platform stats. Stored in SystemSetting
 * (no migration); read by the footer, root layout, invoice route and landing page.
 */

export const MAX_SOCIAL = 16;
export const MAX_CREDITS = 6;
export const MAX_TAGS = 20;
export const MAX_STATS = 6;
export const MAX_IMPORT_BYTES = 80_000;

export type SocialLink = { id: string; icon: SocialIconId; label: string; href: string; enabled: boolean };
export type CreditLine = { id: string; text: string; href: string; enabled: boolean };

export const TAG_KINDS = ["meta", "link", "script"] as const;
export type TagKind = (typeof TAG_KINDS)[number];
export const LINK_RELS = ["preconnect", "dns-prefetch", "alternate", "me", "author", "license"] as const;
export type LinkRel = (typeof LINK_RELS)[number];

export type CustomTag = {
  id: string;
  name: string;
  kind: TagKind;
  enabled: boolean;
  /** meta: the tag's name or property (e.g. google-site-verification) and its value. */
  key: string;
  content: string;
  /** link */
  rel: LinkRel;
  href: string;
  /** script: either a hosted file from an allowed host, or inline code. */
  src: string;
  code: string;
  /** script: where it is added, and whether the visitor's analytics consent is required first. */
  placement: "head" | "body";
  consent: "essential" | "analytics";
};

export const STAT_SOURCES = ["users", "posts_published", "workspaces", "channels", "platforms", "manual"] as const;
export type StatSource = (typeof STAT_SOURCES)[number];
export type StatItem = { id: string; label: string; source: StatSource; manualValue: string; suffix: string; minimum: number; enabled: boolean };

export type BrandingConfig = {
  social: SocialLink[];
  credits: { copyright: string; disclaimer: string; lines: CreditLine[]; builtBy: { enabled: boolean; label: string; name: string; href: string } };
  tags: CustomTag[];
  share: { imageUrl: string; imageAlt: string; twitterHandle: string; cardType: "summary" | "summary_large_image" };
  invoice: {
    documentTitle: string;
    sellerName: string;
    sellerAddress: string;
    sellerTaxLabel: string;
    sellerTaxId: string;
    sellerEmail: string;
    sellerWebsite: string;
    paymentTerms: string;
    footerNote: string;
  };
  stats: { enabled: boolean; title: string; items: StatItem[] };
};

const stat = (id: string, label: string, source: StatSource, suffix = "+"): StatItem => ({ id, label, source, manualValue: "", suffix, minimum: 0, enabled: true });

export const DEFAULT_BRANDING_CONFIG: BrandingConfig = {
  social: [],
  credits: {
    copyright: "© {year} MultiPost Studio.",
    disclaimer:
      "An independent social media management platform, not affiliated with Instagram, Facebook, LinkedIn, X, TikTok, YouTube, Pinterest, Threads, Bluesky, or Google.",
    lines: [],
    // Shown only once a name is filled in (Admin → Site Branding → Footer Credits).
    builtBy: { enabled: true, label: "Built by", name: "", href: "" },
  },
  tags: [],
  share: { imageUrl: "", imageAlt: "MultiPost Studio", twitterHandle: "", cardType: "summary" },
  invoice: {
    documentTitle: "Payment receipt",
    sellerName: "MultiPost Studio",
    sellerAddress: "",
    sellerTaxLabel: "Tax ID",
    sellerTaxId: "",
    sellerEmail: "",
    sellerWebsite: "",
    paymentTerms: "",
    footerNote: "This is a payment receipt for the period shown. It is not a jurisdiction-specific tax invoice and contains no tax breakdown.",
  },
  stats: {
    enabled: false,
    title: "MultiPost Studio in numbers",
    items: [stat("st-users", "Creators and teams", "users"), stat("st-posts", "Posts published", "posts_published"), stat("st-platforms", "Platforms supported", "platforms", ""), stat("st-channels", "Accounts connected", "channels")],
  },
};

/** Image links: a site path or an https address. */
export function isImageUrl(v: string): boolean {
  return /^(\/(?!\/)\S*|https:\/\/[^\s/]+\S*)$/i.test(v.trim()) && v.length <= 500;
}

const id = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/, "Bad id");
const text = (max: number) => z.string().trim().max(max);
const href = z.string().trim().refine(isSafeHref, "Use a site path, https:// link, mailto: or tel:");
const optionalHref = z.string().trim().refine((v) => v === "" || isSafeHref(v), "Use a site path, https:// link, mailto: or tel:");

const socialSchema = z.object({ id, icon: z.enum(SOCIAL_ICON_IDS), label: text(40).min(1, "Give the icon a name"), href, enabled: z.boolean() });
const creditSchema = z.object({ id, text: text(140).min(1, "Write the credit line"), href: optionalHref, enabled: z.boolean() });

const tagSchema = z
  .object({
    id,
    name: text(60).min(1, "Name the tag"),
    kind: z.enum(TAG_KINDS),
    enabled: z.boolean(),
    key: text(80),
    content: text(500),
    rel: z.enum(LINK_RELS),
    href: text(500),
    src: text(500),
    code: z.string().max(8000),
    placement: z.enum(["head", "body"]),
    consent: z.enum(["essential", "analytics"]),
  })
  .superRefine((t, ctx) => {
    const bad = (path: string, message: string) => ctx.addIssue({ code: "custom", path: [path], message });
    if (t.kind === "meta") {
      if (!/^[A-Za-z][\w:.-]{0,79}$/.test(t.key)) bad("key", "Use a name like google-site-verification");
      if (!t.content.trim()) bad("content", "Enter the tag's value");
    } else if (t.kind === "link") {
      if (!/^https:\/\/[^\s/]+\S*$/i.test(t.href)) bad("href", "Link tags need an https:// address");
    } else {
      const hasSrc = t.src.trim() !== "";
      const hasCode = t.code.trim() !== "";
      if (hasSrc === hasCode) bad("code", "Use either a script address or inline code, not both or neither");
      if (hasSrc) {
        let host = "";
        try {
          const u = new URL(t.src.trim());
          host = u.protocol === "https:" ? u.hostname.toLowerCase() : "";
        } catch {
          /* handled below */
        }
        if (!SCRIPT_SRC_HOSTS.includes(host as (typeof SCRIPT_SRC_HOSTS)[number])) bad("src", `Only these hosts are allowed by the site's security policy: ${SCRIPT_SRC_HOSTS.join(", ")}`);
      }
    }
  });

const statSchema = z.object({
  id,
  label: text(40).min(1, "Name the stat"),
  source: z.enum(STAT_SOURCES),
  manualValue: text(20),
  suffix: text(4),
  minimum: z.number().int().min(0).max(1_000_000_000),
  enabled: z.boolean(),
});

const unique = (items: { id: string }[]) => new Set(items.map((i) => i.id)).size === items.length;

export const brandingConfigSchema = z
  .object({
    social: z.array(socialSchema).max(MAX_SOCIAL),
    credits: z.object({
      copyright: text(160),
      disclaimer: text(500),
      lines: z.array(creditSchema).max(MAX_CREDITS),
      builtBy: z.object({ enabled: z.boolean(), label: text(30), name: text(60), href: optionalHref }),
    }),
    tags: z.array(tagSchema).max(MAX_TAGS),
    share: z.object({
      imageUrl: z
        .string()
        .trim()
        .refine((v) => v === "" || isImageUrl(v), "Use a site path or an https:// image address")
        .refine((v) => !/\.svg(\?|#|$)/i.test(v), "Social networks can't show SVG images. Use a PNG or JPG"),
      imageAlt: text(120),
      twitterHandle: z.string().trim().refine((v) => v === "" || /^@?[A-Za-z0-9_]{1,15}$/.test(v), "Enter a handle like @multipost"),
      cardType: z.enum(["summary", "summary_large_image"]),
    }),
    invoice: z.object({
      documentTitle: text(40).min(1, "Give the document a title"),
      sellerName: text(120).min(1, "Enter the business name"),
      sellerAddress: text(300),
      sellerTaxLabel: text(30),
      sellerTaxId: text(40),
      sellerEmail: z.string().trim().refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid email address"),
      sellerWebsite: z.string().trim().refine((v) => v === "" || /^https?:\/\/[^\s/]+\S*$/i.test(v), "Enter a full https:// address"),
      paymentTerms: text(300),
      footerNote: text(500),
    }),
    stats: z.object({ enabled: z.boolean(), title: text(80), items: z.array(statSchema).max(MAX_STATS) }),
  })
  .refine((c) => unique(c.social) && unique(c.credits.lines) && unique(c.tags) && unique(c.stats.items), { message: "Duplicate id in a list", path: ["social"] });

export type ParseResult = { ok: true; config: BrandingConfig } | { ok: false; errors: string[] };

const SECTION: Record<string, string> = {
  social: "Social links",
  credits: "Footer credits",
  tags: "Custom tags",
  share: "Social image",
  invoice: "Invoice settings",
  stats: "Platform stats",
};

/** "social.2.href" -> "Social links, item 3"; the field name is dropped, the message already says what is wrong. */
export function describeIssue(path: PropertyKey[], message: string): string {
  const section = SECTION[String(path[0])] ?? "Branding";
  const row = path.find((p): p is number => typeof p === "number");
  const nested = path[0] === "credits" && path[1] === "lines" && row !== undefined ? " (credit line " + (row + 1) + ")" : row !== undefined ? ` (item ${row + 1})` : "";
  return `${section}${nested}: ${message}`;
}

const obj = (v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** Fills anything missing from the defaults, so a partial import or an older row stays valid. */
function withDefaults(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const i = input as Record<string, unknown>;
  const d = DEFAULT_BRANDING_CONFIG;
  return {
    ...d,
    ...i,
    credits: { ...d.credits, ...obj(i.credits), builtBy: { ...d.credits.builtBy, ...obj(obj(i.credits).builtBy) } },
    share: { ...d.share, ...obj(i.share) },
    invoice: { ...d.invoice, ...obj(i.invoice) },
    stats: { ...d.stats, ...obj(i.stats) },
  };
}

/** Strict parse for saving and importing: every problem is reported, nothing is silently dropped. */
export function parseBrandingConfig(input: unknown): ParseResult {
  const res = brandingConfigSchema.safeParse(withDefaults(input));
  if (res.success) return { ok: true, config: res.data as BrandingConfig };
  return { ok: false, errors: res.error.issues.slice(0, 8).map((e) => describeIssue(e.path, e.message)) };
}

/** Lenient read for rendering: a damaged row falls back to the defaults, never a broken page. */
export function normalizeBrandingConfig(input: unknown): BrandingConfig {
  const r = parseBrandingConfig(input);
  return r.ok ? r.config : DEFAULT_BRANDING_CONFIG;
}

export function newTag(): CustomTag {
  return { id: `tag-${Math.random().toString(36).slice(2, 8)}`, name: "", kind: "meta", enabled: true, key: "", content: "", rel: "preconnect", href: "", src: "", code: "", placement: "head", consent: "analytics" };
}
