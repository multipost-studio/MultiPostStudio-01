"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Link2, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { label: "Acquisition", href: "/admin/marketing", icon: BarChart3, exact: true },
  { label: "UTM links", href: "/admin/marketing/links", icon: Link2 },
  { label: "Audiences", href: "/admin/marketing/audiences", icon: Users },
];

export function MarketingSubNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Marketing" className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] pb-2 pt-1 text-[13px]">
      {TABS.map((t) => {
        const active = t.exact ? pathname === t.href : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-sm)] px-3 py-1.5 font-medium transition-colors",
              active ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <t.icon size={14} aria-hidden /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
