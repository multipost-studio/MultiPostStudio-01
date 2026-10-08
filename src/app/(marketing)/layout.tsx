import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { MarketingNav, MarketingMobileMenu } from "./marketing-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { ScrollProgress } from "./scroll-progress";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { MascotHost } from "@/components/mascot";
import { getAllNavLinks } from "@/lib/cms";
import { AttributionBeacon } from "@/components/marketing/attribution-beacon";
import { SiteFooter } from "@/components/marketing/site-footer";
import { loadFooterConfig } from "@/lib/footer/store";
import { loadBranding } from "@/lib/branding/store";
import { footerLists, resolveFooter } from "@/lib/footer/resolve";
import { getSiteIndex } from "@/lib/site-index";
import { appUrl } from "@/lib/env";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const nav = await getAllNavLinks();
  // Standard columns stay live from Content (CMS); everything else comes from Admin → Footer & Links, and social icons and credits from Admin → Site Branding.
  const [footerConfig, branding, index] = await Promise.all([loadFooterConfig(), loadBranding(), getSiteIndex()]);
  const footer = resolveFooter(footerConfig, footerLists(nav, index), branding);
  return (
    <div className="min-h-screen bg-[var(--bg)] overflow-x-clip">
      <AttributionBeacon />
      <AnnouncementBanner />
      <ScrollProgress />
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-2 px-3 sm:px-6">
          <Link href="/" className="inline-flex shrink-0 items-center" aria-label="MultiPost Studio home">
            <Logo size={28} className="sm:hidden" />
            <Logo size={34} className="hidden sm:inline-flex" />
          </Link>
          <MarketingNav
            product={nav.product}
            solution={nav.solution}
            resource={nav.resource}
            company={nav.company}
          />
          {/* Right-hand actions: theme, Sign in (desktop) + Start free + Hamburger (mobile/tablet) */}
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm" className="hidden lg:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm" className="px-2.5 sm:px-4 text-[13px] sm:text-[13.5px] font-semibold">
              <Link href="/signup">Start free</Link>
            </Button>
            <MarketingMobileMenu
              product={nav.product}
              solution={nav.solution}
              resource={nav.resource}
              company={nav.company}
            />
          </div>
        </div>
      </header>

      {children}

      <SiteFooter model={footer} appUrl={appUrl()} />
      {/* Quiet landing-page companion: no auto-messages, assistant on tap. */}
      <MascotHost variant="subtle" />
    </div>
  );
}
