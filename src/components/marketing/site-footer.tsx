import Link from "next/link";
import { Activity, AppWindow, ArrowRight, ArrowUpRight, BookOpen, Code2, Globe, Mail, MapPin, Phone, Rss, Smartphone, Store, Users } from "lucide-react";
import { CookieSettingsButton } from "@/components/consent/cookie-settings-button";
import type { AppIcon } from "@/lib/footer/config";
import { SOCIAL_ICONS, type SocialIconId } from "@/lib/footer/icons";
import { isExternal, type FooterModel, type RenderLink } from "@/lib/footer/resolve";

/**
 * The marketing footer: a dark, glowing panel (it stays dark in light theme, like the
 * reference), link columns, an "apps" strip, social icons and a giant wordmark. It is
 * purely presentational, driven by the resolved model, so the admin preview renders the
 * exact same component the public site does.
 */

const APP_ICON: Record<AppIcon, React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>> = {
  web: AppWindow,
  mobile: Smartphone,
  api: Code2,
  docs: BookOpen,
  status: Activity,
  community: Users,
  store: Store,
  globe: Globe,
};

const GENERIC_ICON = { email: Mail, website: Globe, rss: Rss, phone: Phone } as const;

function SocialGlyph({ icon, size = 17 }: { icon: SocialIconId; size?: number }) {
  const def = SOCIAL_ICONS[icon];
  if (def.generic) {
    const Generic = GENERIC_ICON[def.generic];
    return <Generic size={size} aria-hidden />;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d={def.path} />
    </svg>
  );
}

/** A link that opens in a new tab (with safe rel) when it leaves the site or the admin asked for it. */
function FooterAnchor({ link, className, children }: { link: RenderLink; className?: string; children?: React.ReactNode }) {
  const external = isExternal(link.href) || link.href.startsWith("mailto:") || link.href.startsWith("tel:");
  if (external || link.newTab) {
    return (
      <a
        href={link.href}
        className={className}
        {...(link.newTab || isExternal(link.href) ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      >
        {children ?? link.label}
      </a>
    );
  }
  return (
    <Link href={link.href} className={className}>
      {children ?? link.label}
    </Link>
  );
}

export function SiteFooter({ model, appUrl }: { model: FooterModel; appUrl?: string }) {
  const { contact } = model;
  const hasContact = Boolean(contact.email || contact.phone || contact.address);
  return (
    <footer className="mps-footer px-2.5 pb-2.5 pt-12 sm:px-4 sm:pb-4 sm:pt-16" aria-label="Site footer">
      <div className="relative isolate overflow-hidden rounded-[26px] bg-[#08080a] text-white ring-1 ring-white/10 sm:rounded-[36px]">
        <div aria-hidden className="mps-footer__glow mps-footer__glow--a" />
        <div aria-hidden className="mps-footer__glow mps-footer__glow--b" />
        <div aria-hidden className="mps-footer__grain" />

        <div className="relative mx-auto max-w-6xl px-6 pt-12 sm:px-10 sm:pt-16">
          <div className="grid gap-12 lg:grid-cols-12">
            {/* Brand, contact, call to action, social */}
            <div className="lg:col-span-4">
              <Link href="/" aria-label="MultiPost Studio home" className="inline-flex">
                {/* The panel is always dark, so always the dark-background logo. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/media/logo-dark.png" alt="MultiPost Studio" className="h-10 w-auto rounded-[6px]" />
              </Link>
              {model.tagline && <p className="mt-4 max-w-xs text-[15px] leading-relaxed text-white/60">{model.tagline}</p>}

              {hasContact && (
                <ul className="mt-6 space-y-2.5 text-[14px] text-white/70">
                  {contact.email && (
                    <li className="flex items-start gap-2.5">
                      <Mail size={15} aria-hidden className="mt-0.5 shrink-0 text-white/40" />
                      <a href={`mailto:${contact.email}`} className="mps-footer__link">{contact.email}</a>
                    </li>
                  )}
                  {contact.phone && (
                    <li className="flex items-start gap-2.5">
                      <Phone size={15} aria-hidden className="mt-0.5 shrink-0 text-white/40" />
                      <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`} className="mps-footer__link">{contact.phone}</a>
                    </li>
                  )}
                  {contact.address && (
                    <li className="flex items-start gap-2.5">
                      <MapPin size={15} aria-hidden className="mt-0.5 shrink-0 text-white/40" />
                      <span className="whitespace-pre-line">{contact.address}</span>
                    </li>
                  )}
                </ul>
              )}

              {model.cta && (
                <div className="mt-8">
                  {model.cta.title && <p className="max-w-xs text-[15px] font-medium leading-snug text-white">{model.cta.title}</p>}
                  <FooterAnchor
                    link={{ label: model.cta.label, href: model.cta.href, newTab: false }}
                    className="mps-footer__cta mt-3 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-[14px] font-semibold text-[#0b0b0d]"
                  >
                    {model.cta.label} <ArrowRight size={15} aria-hidden />
                  </FooterAnchor>
                </div>
              )}

              {model.social.length > 0 && (
                <ul className="mt-8 flex flex-wrap gap-2.5" aria-label="Social media">
                  {model.social.map((s) => (
                    <li key={s.id}>
                      <FooterAnchor
                        link={{ label: s.label, href: s.href, newTab: isExternal(s.href) }}
                        className="mps-footer__social flex h-10 w-10 items-center justify-center rounded-xl border border-white/15 bg-white/[0.06] text-white/80"
                      >
                        <SocialGlyph icon={s.icon} />
                        <span className="sr-only">{s.label}</span>
                      </FooterAnchor>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Link columns */}
            <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:col-span-8 xl:grid-cols-5">
              {model.columns.map((col) => (
                <div key={col.id} className="min-w-0">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/40">{col.title}</p>
                  <ul className="mt-4 space-y-2.5">
                    {col.links.map((l) => (
                      <li key={l.href + l.label}>
                        <FooterAnchor link={l} className="mps-footer__link text-[15px] text-white/80" />
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </nav>
          </div>

          {/* Other apps and destinations */}
          {model.apps.items.length > 0 && (
            <section aria-label={model.apps.title || "More from MultiPost"} className="mt-14 border-t border-white/10 pt-10">
              {model.apps.title && <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-white/40">{model.apps.title}</p>}
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {model.apps.items.map((a) => {
                  const Icon = APP_ICON[a.icon] ?? Globe;
                  const href = a.href === "https://app.multipoststudio.online" && appUrl ? appUrl : a.href;
                  return (
                    <li key={a.id}>
                      <FooterAnchor
                        link={{ label: a.label, href, newTab: a.newTab }}
                        className="mps-footer__card group flex h-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                      >
                        <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                          <Icon size={18} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-white">{a.label}</span>
                          {a.description && <span className="block truncate text-[13px] text-white/50">{a.description}</span>}
                        </span>
                        <ArrowUpRight size={16} aria-hidden className="shrink-0 text-white/40 transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-white" />
                      </FooterAnchor>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Legal strip */}
          <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-[13px] text-white/50 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-white/60">{model.copyright}</p>
            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
              {model.bottomLinks.map((l) => (
                <li key={l.href + l.label}>
                  <FooterAnchor link={l} className="mps-footer__link" />
                </li>
              ))}
              <li>
                <CookieSettingsButton className="mps-footer__link" />
              </li>
            </ul>
          </div>
          {model.disclaimer && <p className="mt-4 max-w-4xl text-[12px] leading-relaxed text-white/55">{model.disclaimer}</p>}
        </div>

        {model.wordmark ? (
          <div aria-hidden className="mps-footer__wordmark relative mt-10 select-none overflow-hidden px-4 sm:px-8">
            <p className="whitespace-nowrap text-center font-black leading-[0.82] tracking-[-0.045em] text-white" style={{ fontSize: "clamp(2.1rem, 10.4vw, 11.5rem)" }}>
              {model.wordmark.primary}
              {model.wordmark.secondary && <span className="font-extralight text-white/90"> {model.wordmark.secondary}</span>}
            </p>
          </div>
        ) : (
          <div className="h-10" />
        )}
      </div>
    </footer>
  );
}
