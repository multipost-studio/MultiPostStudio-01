import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/session";
import { ADMIN_NAV } from "@/lib/nav";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { AdminNav } from "./admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <aside className="w-56 shrink-0 border-r border-[var(--border)] bg-[var(--bg-elevated)] p-4">
        <div className="mb-6 flex items-center gap-2">
          <Logo size={24} />
          <span className="rounded bg-[var(--danger-soft)] px-1.5 py-0.5 text-[11px] font-semibold text-[var(--danger)]">
            ADMIN
          </span>
        </div>
        <AdminNav items={ADMIN_NAV} />
        <Link
          href="/dashboard"
          className="mt-6 block rounded-[var(--radius-md)] px-2.5 py-2 text-[14px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)]"
        >
          ← Back to app
        </Link>
      </aside>
      <div className="flex-1">
        <header className="flex h-14 items-center justify-between border-b border-[var(--border)] px-6">
          <p className="text-[14px] font-semibold text-[var(--text)]">Platform administration</p>
          <ThemeToggle />
        </header>
        <main className="mx-auto max-w-6xl p-6">{children}</main>
      </div>
    </div>
  );
}
