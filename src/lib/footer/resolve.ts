import type { AppIcon, AutoSource, FooterConfig, ListSource, NavSource } from "./config";
import { NAV_SOURCES } from "./config";
import type { BrandingConfig } from "@/lib/branding/config";
import type { SocialIconId } from "./icons";

/** A link from Content (CMS) or the site index. */
export type NavLinkLike = { label: string; href: string };
/** Every list a column can draw from: the CMS menus plus the auto lists built from site pages. */
export type NavLists = Record<ListSource, NavLinkLike[]>;

export type RenderLink = { label: string; href: string; newTab: boolean };
export type FooterModel = {
  tagline: string;
  contact: { email: string; phone: string; address: string };
  cta: { title: string; label: string; href: string } | null;
  columns: { id: string; title: string; links: RenderLink[] }[];
  apps: { title: string; items: { id: string; label: string; description: string; href: string; icon: AppIcon; newTab: boolean }[] };
  social: { id: string; icon: SocialIconId; label: string; href: string }[];
  bottomLinks: RenderLink[];
  copyright: string;
  /** Extra credit lines (e.g. "Designed by …"), each with an optional link. */
  credits: { id: string; text: string; href: string }[];
  /** The "Built by …" row, shown only when a name is set. */
  builtBy: { label: string; name: string; href: string } | null;
  disclaimer: string;
  wordmark: { primary: string; secondary: string } | null;
};

/**
 * Turns the saved settings plus the live CMS link lists into what the footer draws.
 * Pure: disabled items, hidden links and empty columns are dropped here, so the
 * public footer and the admin preview can never disagree.
 */
export function resolveFooter(config: FooterConfig, nav: NavLists, branding: Pick<BrandingConfig, "social" | "credits">, now: Date = new Date()): FooterModel {
  const columns = config.columns
    .filter((c) => c.enabled)
    .map((c) => {
      const extras = c.links.filter((l) => l.enabled).map((l) => ({ label: l.label, href: l.href, newTab: l.newTab }));
      const live =
        c.source === "custom"
          ? []
          : (nav[c.source] ?? [])
              .filter((l) => !c.hidden.includes(l.href))
              .map((l) => ({ label: l.label, href: l.href, newTab: false }));
      // The same page can be in both the live list and the extras: show it once.
      const seen = new Set<string>();
      const links = [...live, ...extras].filter((l) => (seen.has(l.href) ? false : (seen.add(l.href), true)));
      return { id: c.id, title: c.title, links };
    })
    .filter((c) => c.links.length > 0);

  const year = String(now.getUTCFullYear());
  return {
    tagline: config.tagline,
    contact: config.contact,
    cta: config.cta.enabled && config.cta.label ? { title: config.cta.title, label: config.cta.label, href: config.cta.href } : null,
    columns,
    apps: { title: config.apps.title, items: config.apps.items.filter((a) => a.enabled) },
    social: branding.social.filter((s) => s.enabled).map(({ id, icon, label, href }) => ({ id, icon, label, href })),
    bottomLinks: config.bottomLinks.filter((l) => l.enabled).map(({ label, href, newTab }) => ({ label, href, newTab })),
    copyright: branding.credits.copyright.replaceAll("{year}", year),
    credits: branding.credits.lines.filter((l) => l.enabled).map(({ id, text, href }) => ({ id, text, href })),
    builtBy: branding.credits.builtBy.enabled && branding.credits.builtBy.name.trim() ? { label: branding.credits.builtBy.label.trim(), name: branding.credits.builtBy.name.trim(), href: branding.credits.builtBy.href.trim() } : null,
    disclaimer: branding.credits.disclaimer,
    wordmark: config.wordmark.enabled && (config.wordmark.primary || config.wordmark.secondary) ? { primary: config.wordmark.primary, secondary: config.wordmark.secondary } : null,
  };
}

/** Merges the CMS menus with the auto lists built from the site's pages into every list a column can use. */
export function footerLists(nav: Pick<NavLists, NavSource>, index: Pick<NavLists, AutoSource>): NavLists {
  return { ...nav, ...index };
}

/** Links outside this site open in a new tab with safe rel values. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export { NAV_SOURCES };
