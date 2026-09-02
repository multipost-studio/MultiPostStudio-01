"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icon";
import { cn } from "@/lib/utils";

export function SettingsNav({ items }: { items: { label: string; href: string; icon: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-0.5">
      {items.map((i) => {
        const active = pathname === i.href || pathname.startsWith(i.href + "/");
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "flex items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium transition-colors",
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
