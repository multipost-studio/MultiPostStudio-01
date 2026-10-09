import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import { requireWorkspace } from "@/lib/session";
import { PageHeader } from "@/components/page-header";
import { isFilter, listNotifications, type NotificationFilter } from "@/lib/notifications/service";
import { NotificationCenter } from "./center";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  const ctx = await requireWorkspace();
  const sp = await searchParams;
  const filter: NotificationFilter = isFilter(sp.filter) ? sp.filter : "all";
  const initial = await listNotifications({ userId: ctx.user.id, workspaceId: ctx.active.workspace.id }, { filter, limit: 20 }).catch(() => ({
    items: [],
    nextCursor: null,
    unread: 0,
  }));

  return (
    <div>
      <PageHeader
        title="Notifications"
        description="Publishing results, reminders, mentions and account alerts for this workspace."
        actions={
          <Link
            href="/settings/notifications"
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-strong)] px-3.5 text-[13px] font-medium text-[var(--text)] hover:bg-[var(--surface-hover)] focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
          >
            <Settings size={14} aria-hidden /> Preferences
          </Link>
        }
      />
      <NotificationCenter initial={initial} initialFilter={filter} />
    </div>
  );
}
