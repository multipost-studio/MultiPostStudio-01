import type { Metadata } from "next";
import { PartyPopper } from "lucide-react";
import { requireAdminPermission } from "@/lib/session";
import { db } from "@/lib/db";
import { FESTIVALS } from "@/lib/festivals/catalog";
import { nextOccurrence, resolveFestivals } from "@/lib/festivals/resolve";
import { loadFestivalConfig } from "@/lib/festivals/store";
import { FestivalsClient, type ActivityRow, type NextMap } from "./festivals-client";

export const metadata: Metadata = { title: "Admin · Festival Themes" };
export const dynamic = "force-dynamic";

async function recentActivity(): Promise<ActivityRow[]> {
  try {
    const rows = await db.auditLog.findMany({
      where: { action: { startsWith: "admin.festival_" } },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, action: true, createdAt: true, actor: { select: { name: true, email: true } } },
    });
    return rows.map((r) => ({ id: r.id, action: r.action, at: r.createdAt.toISOString(), by: r.actor?.name || r.actor?.email || "an admin" }));
  } catch {
    return [];
  }
}

export default async function AdminFestivalsPage() {
  await requireAdminPermission("marketing.view");
  const config = await loadFestivalConfig();
  const nowMs = Date.now();
  const { today } = resolveFestivals(config, nowMs);
  const nexts: NextMap = Object.fromEntries(FESTIVALS.map((f) => [f.id, nextOccurrence(config, f.id, today)]));
  const activity = await recentActivity();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-3 text-3xl font-semibold leading-tight tracking-tight text-[var(--text)] sm:text-[40px]">
          <PartyPopper className="h-8 w-8 shrink-0 text-[var(--primary)]" aria-hidden /> Festival Themes
        </h1>
        <p className="mt-1 max-w-3xl text-[15px] text-[var(--text-muted)]">
          Celebrate with your users: a festive ribbon, drifting particles and a greeting across the site, app and admin. Turn a theme on by hand, or let the calendar do it. Everything here is saved and read live by the public site.
        </p>
      </div>
      <FestivalsClient initialConfig={config} nowMs={nowMs} nexts={nexts} activity={activity} />
    </div>
  );
}
