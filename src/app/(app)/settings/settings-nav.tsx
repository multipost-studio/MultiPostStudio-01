"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { label: string; href: string; icon: string }[] }) {
  const pathname = usePathname();
  return (
    /* Mobile: horizontal scroll rail so ~10 settings links don't push the
       form a screen down. Desktop: the familiar vertical list. */
    <nav className="mps-scroll-x -mx-3 flex gap-1 overflow-x-auto px-3 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:space-y-0.5 lg:overflow-visible lg:pb-0">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex shrink-0 items-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium transition-colors",
              active
                ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <Icon name={i.icon} size={15} />
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
