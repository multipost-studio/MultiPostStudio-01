import type { AppIcon, FooterConfig, NavSource } from "./config";
import { NAV_SOURCES } from "./config";
import type { SocialIconId } from "./icons";

/** A link from Content (CMS), the same lists the header menus use. */
export type NavLinkLike = { label: string; href: string };
export type NavLists = Record<NavSource, NavLinkLike[]>;

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
  disclaimer: string;
  wordmark: { primary: string; secondary: string } | null;
};

/**
 * Turns the saved settings plus the live CMS link lists into what the footer draws.
 * Pure: disabled items, hidden links and empty columns are dropped here, so the
 * public footer and the admin preview can never disagree.
 */
export function resolveFooter(config: FooterConfig, nav: NavLists, now: Date = new Date()): FooterModel {
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
    social: config.social.filter((s) => s.enabled).map(({ id, icon, label, href }) => ({ id, icon, label, href })),
    bottomLinks: config.bottomLinks.filter((l) => l.enabled).map(({ label, href, newTab }) => ({ label, href, newTab })),
    copyright: config.copyright.replaceAll("{year}", year),
    disclaimer: config.disclaimer,
    wordmark: config.wordmark.enabled && (config.wordmark.primary || config.wordmark.secondary) ? { primary: config.wordmark.primary, secondary: config.wordmark.secondary } : null,
  };
}

/** Links outside this site open in a new tab with safe rel values. */
export function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export { NAV_SOURCES };
