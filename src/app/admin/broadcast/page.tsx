import type { Metadata } from "next";
import { db } from "@/lib/db";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Stat } from "@/components/ui/misc";
import { getPlans } from "@/lib/plans";
import { relativeTime } from "@/lib/utils";
import { BroadcastForm } from "../_more-client";

export const metadata: Metadata = { title: "Admin · Broadcast" };

export default async function AdminBroadcastPage() {
  const [plans, totalUsers, verified, recent] = await Promise.all([
    getPlans(),
    db.user.count({ where: { deletedAt: null } }),
    db.user.count({ where: { deletedAt: null, emailVerified: { not: null } } }),
    db.notification.findMany({
      where: { type: "system" },
      orderBy: { createdAt: "desc" },
      distinct: ["title"],
      take: 15,
      select: { title: true, body: true, createdAt: true },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Broadcast</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Push an in-app notification to a slice of users. Appears in their notification bell immediately.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="All users" value={totalUsers} />
        <Stat label="Verified" value={verified} />
        <Stat label="Unverified" value={totalUsers - verified} />
      </div>

      <BroadcastForm planKeys={plans.map((p) => p.key)} />

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Recent broadcasts</h2>
        <Table>
          <THead>
            <TR><TH>Title</TH><TH>Body</TH><TH>Sent</TH></TR>
          </THead>
          <tbody>
            {recent.map((n, i) => (
              <TR key={i}>
                <TD className="font-medium text-[var(--text)]">{n.title}</TD>
                <TD className="max-w-[420px] truncate text-[var(--text-muted)]">{n.body}</TD>
                <TD className="text-[var(--text-subtle)]">{relativeTime(n.createdAt)}</TD>
              </TR>
            ))}
            {recent.length === 0 && (
              <TR><TD colSpan={3} className="py-8 text-center text-[var(--text-subtle)]">Nothing sent yet.</TD></TR>
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
