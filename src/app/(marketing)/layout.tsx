import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { MarketingNav } from "./marketing-nav";
import { ScrollProgress } from "./scroll-progress";
import { AnnouncementBanner } from "@/components/announcement-banner";
import {
  PRODUCT_LINKS,
  SOLUTION_LINKS,
  RESOURCE_LINKS,
  COMPANY_LINKS,
  LEGAL_LINKS,
} from "./_data";

const FOOTER_COLS = [
  { title: "Product", links: PRODUCT_LINKS },
  { title: "Solutions", links: SOLUTION_LINKS },
  { title: "Resources", links: RESOURCE_LINKS },
  { title: "Company", links: COMPANY_LINKS },
  { title: "Legal", links: LEGAL_LINKS },
];

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <AnnouncementBanner />
      <ScrollProgress />
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link href="/">
            <Logo />
          </Link>
          <MarketingNav />
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Start free</Link>
            </Button>
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
