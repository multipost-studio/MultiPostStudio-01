import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { MarketingNav, MarketingMobileMenu } from "./marketing-nav";
import { ScrollProgress } from "./scroll-progress";
import { AnnouncementBanner } from "@/components/announcement-banner";
import { getAllNavLinks } from "@/lib/cms";

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const nav = await getAllNavLinks();
  const FOOTER_COLS = [
    { title: "Product", links: nav.product },
    { title: "Solutions", links: nav.solution },
    { title: "Resources", links: nav.resource },
    { title: "Company", links: nav.company },
    { title: "Legal", links: nav.legal },
  ];
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AnnouncementBanner />
      <ScrollProgress />
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/" className="inline-flex shrink-0 items-center" aria-label="MultiPost Studio home">
            <Logo />
          </Link>
          <MarketingNav
            product={nav.product}
            solution={nav.solution}
            resource={nav.resource}
            company={nav.company}
          />
          {/* One right-hand group. The hamburger belongs here, not as a third
              child of justify-between — that stranded it mid-bar on mobile. */}
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <ThemeToggle />
            {/* No room for Sign in at 375px; it lives in the mobile menu footer. */}
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
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

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto max-w-6xl px-5 py-14">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
            <div className="lg:col-span-1">
              <Logo size={30} />
              <p className="mt-3 max-w-[200px] text-[13px] text-[var(--text-subtle)]">
                The AI-powered social media operating system.
              </p>
            </div>
            {FOOTER_COLS.map((col) => (
              <div key={col.title}>
                <p className="text-[13px] font-semibold text-[var(--text)]">{col.title}</p>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      <Link href={l.href} className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text)]">
                        {l.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-3 border-t border-[var(--border)] pt-6 text-[13px] text-[var(--text-subtle)] sm:flex-row sm:items-center">
            <p>© {new Date().getFullYear()} MultiPost Studio. An original demo product — not affiliated with any existing platform.</p>
            <div className="flex gap-4">
              <Link href="/status" className="hover:text-[var(--text)]">Status</Link>
              <Link href="/security" className="hover:text-[var(--text)]">Security</Link>
              <Link href="/contact" className="hover:text-[var(--text)]">Contact</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
