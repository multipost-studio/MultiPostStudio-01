"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";
import type { NavLink } from "@/lib/cms";

export type NavGroups = {
  product: NavLink[];
  solution: NavLink[];
  resource: NavLink[];
  company: NavLink[];
};

function menusOf({ product, solution, resource, company }: NavGroups) {
  return [
    { label: "Product", links: product },
    { label: "Solutions", links: solution },
    { label: "Resources", links: resource },
    { label: "Company", links: company },
  ];
}

/**
 * Desktop dropdown nav. Renders nothing below `md` — the mobile equivalent is
 * <MarketingMobileMenu/>, which is a SEPARATE component on purpose: this one
 * belongs in the middle of the header, the hamburger belongs with the sign-in
 * buttons on the right. They used to be siblings in one fragment, which made
 * the hamburger a third child of the header's `justify-between` and stranded it
 * in the centre of the bar on mobile.
 */
export function MarketingNav(groups: NavGroups) {
  const MENUS = menusOf(groups);
  const [open, setOpen] = React.useState<string | null>(null);

  return (
    <nav className="hidden items-center gap-1 md:flex" onMouseLeave={() => setOpen(null)}>
      {MENUS.map((m) => (
        <div
          key={m.label}
          className="relative"
          onMouseEnter={() => setOpen(m.label)}
          // Escape closes the panel without moving focus off the trigger.
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(null);
          }}
        >
          <button
            type="button"
            aria-haspopup="true"
            aria-expanded={open === m.label}
            // Hover alone left these menus unreachable by keyboard: the panel
            // only opened on mouseenter, so Tab + Enter did nothing.
            onClick={() => setOpen(open === m.label ? null : m.label)}
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius-md)] px-3 py-2 text-[14px] font-medium transition-colors",
              open === m.label ? "bg-[var(--surface-hover)] text-[var(--text)]" : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            {m.label}
            <ChevronDown size={13} className={cn("transition-transform", open === m.label && "rotate-180")} />
          </button>
          {open === m.label && (
            <div className="absolute left-0 top-full z-50 w-[320px] pt-2">
              <div className="mps-scale-in rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-2 shadow-lg">
                {m.links.map((l) => {
                  const desc = "desc" in l ? (l as { desc?: string }).desc : undefined;
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setOpen(null)}
                      className="block rounded-[var(--radius-md)] p-2.5 hover:bg-[var(--surface-hover)]"
                    >
                      <span className="block text-[14px] font-medium text-[var(--text)]">{l.label}</span>
                      {desc && <span className="block text-[13px] text-[var(--text-subtle)]">{desc}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ))}
      <Link href="/pricing" className="rounded-[var(--radius-md)] px-3 py-2 text-[14px] font-medium text-[var(--text-muted)] hover:text-[var(--text)]">
        Pricing
      </Link>
    </nav>
  );
}

/** Hamburger + full-screen panel. Sits inside the header's right-hand group. */
export function MarketingMobileMenu(groups: NavGroups) {
  const MENUS = menusOf(groups);
  const [mobile, setMobile] = React.useState(false);
  const close = () => setMobile(false);

  // The panel is a scroll container; locking the body stops the page behind it
  // from scrolling under the overlay on iOS.
  React.useEffect(() => {
    if (!mobile) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobile]);

  return (
    <>
      <button
        type="button"
        className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)] md:hidden"
        onClick={() => setMobile(true)}
        aria-label="Open menu"
        aria-expanded={mobile}
      >
        <Menu size={20} />
      </button>

      {/* Portalled to <body> on purpose. The header is `sticky` with
          `backdrop-blur`, and a backdrop-filter makes an element the containing
          block for its `position: fixed` descendants — so rendering the panel
          in place trapped it inside the 64px header instead of covering the
          viewport, and the page showed through underneath it. */}
      {mobile && createPortal(
        // flex column + flex-1 scroll area: the old markup put overflow-y-auto
        // on an unconstrained div inside `inset-0`, so on a short phone the
        // lower menu items ran off-screen with no way to reach them.
        <div className="fixed inset-0 z-[80] flex flex-col bg-[var(--bg)] md:hidden">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--border)] px-5">
            <Link href="/" onClick={close} aria-label="MultiPost Studio home">
              <Logo />
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="-mr-1 inline-flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
            >
              <X size={22} />
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto px-5 py-6">
            {MENUS.map((m) => (
              <div key={m.label}>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{m.label}</p>
                <div className="space-y-1">
                  {m.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={close}
                      className="block py-1.5 text-[15px] text-[var(--text)]"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <Link href="/pricing" onClick={close} className="block py-1.5 text-[15px] font-medium text-[var(--text)]">
              Pricing
            </Link>
          </div>

          {/* Sign in is hidden from the mobile header bar (no room at 375px),
              so it has to be reachable here or it would be lost entirely. */}
          <div className="shrink-0 space-y-2 border-t border-[var(--border)] px-5 py-4">
            <Button asChild variant="secondary" className="w-full" onClick={close}>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild className="w-full" onClick={close}>
              <Link href="/signup">Start free</Link>
            </Button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
