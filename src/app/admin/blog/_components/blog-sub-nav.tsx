"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  PenTool,
  FolderTree,
  Tag,
  UserCheck,
  Image as ImageIcon,
  MessageSquare,
  Calendar,
  BarChart3,
  Upload,
  Settings,
} from "lucide-react";

const NAV_TABS = [
  { label: "Dashboard", href: "/admin/blog", icon: LayoutDashboard, exact: true },
  { label: "New Post", href: "/admin/blog/new", icon: PenTool },
  { label: "Categories", href: "/admin/blog/categories", icon: FolderTree },
  { label: "Tags", href: "/admin/blog/tags", icon: Tag },
  { label: "Authors", href: "/admin/blog/authors", icon: UserCheck },
  { label: "Media", href: "/admin/blog/media", icon: ImageIcon },
  { label: "Comments", href: "/admin/blog/comments", icon: MessageSquare },
  { label: "Calendar", href: "/admin/blog/calendar", icon: Calendar },
  { label: "Analytics", href: "/admin/blog/analytics", icon: BarChart3 },
  { label: "Import", href: "/admin/blog/import", icon: Upload },
  { label: "Settings", href: "/admin/blog/settings", icon: Settings },
];

export function BlogSubNav() {
  const pathname = usePathname();

  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-[var(--border)] pb-2 pt-1 text-[13px] no-scrollbar">
      {NAV_TABS.map((tab) => {
        const Icon = tab.icon;
        const active = tab.exact ? pathname === tab.href : pathname === tab.href || pathname.startsWith(tab.href + "/");

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-md)] px-3 py-1.5 font-medium transition-colors",
              active
                ? "bg-[var(--primary-soft)] text-[var(--primary)] shadow-sm"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <Icon size={14} className="shrink-0" />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
