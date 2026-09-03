"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { NavLink } from "@/lib/cms";

export function MarketingNav({
  product,
  solution,
  resource,
  company,
}: {
  product: NavLink[];
  solution: NavLink[];
  resource: NavLink[];
  company: NavLink[];
}) {
  const MENUS = [
    { label: "Product", links: product },
    { label: "Solutions", links: solution },
    { label: "Resources", links: resource },
    { label: "Company", links: company },
  ];
  const [open, setOpen] = React.useState<string | null>(null);
  const [mobile, setMobile] = React.useState(false);

  return (
    <>
      <nav className="hidden items-center gap-1 md:flex" onMouseLeave={() => setOpen(null)}>
        {MENUS.map((m) => (
          <div key={m.label} className="relative" onMouseEnter={() => setOpen(m.label)}>
            <button
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

      <button className="md:hidden" onClick={() => setMobile(true)} aria-label="Open menu">
        <Menu size={20} />
      </button>

      {mobile && (
        <div className="fixed inset-0 z-[80] bg-[var(--bg)] p-5 md:hidden">
          <div className="mb-6 flex justify-end">
            <button onClick={() => setMobile(false)} aria-label="Close menu">
              <X size={22} />
            </button>
          </div>
          <div className="space-y-6 overflow-y-auto">
            {MENUS.map((m) => (
              <div key={m.label}>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-subtle)]">{m.label}</p>
                <div className="space-y-1">
                  {m.links.map((l) => (
                    <Link
                      key={l.href}
                      href={l.href}
                      onClick={() => setMobile(false)}
                      className="block py-1.5 text-[15px] text-[var(--text)]"
                    >
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
            <Link href="/pricing" onClick={() => setMobile(false)} className="block py-1.5 text-[15px] font-medium text-[var(--text)]">
              Pricing
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
