import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/utils";
import { parseAdminQuery } from "@/lib/admin-query";
import { AdminToolbar, Pagination } from "../_controls";

export const metadata: Metadata = { title: "Admin · Referrals" };

export default async function AdminReferralsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = parseAdminQuery(raw, { defaultSort: "createdAt", sortable: ["createdAt"], filterKeys: ["status"] });
  const where = query.filters.status ? { status: query.filters.status } : {};

  const [settings, referrals, total, rewardAgg, topReferrers, convertedCount] = await Promise.all([
    getSettings(),
    db.referral.findMany({
      where,
      orderBy: { createdAt: query.dir },
      skip: query.skip,
      take: query.perPage,
      include: {
        referrer: { select: { name: true, email: true } },
        referee: { select: { name: true, email: true } },
      },
    }),
    db.referral.count({ where }),
    db.referralReward.aggregate({ _sum: { aiCredits: true }, _count: true }),
    db.referral.groupBy({ by: ["referrerId"], _count: true, orderBy: { _count: { referrerId: "desc" } }, take: 5 }),
    db.referral.count({ where: { status: "converted" } }),
  ]);

  const converted = convertedCount;
  const referrerNames = Object.fromEntries(
    (await db.user.findMany({ where: { id: { in: topReferrers.map((t) => t.referrerId) } }, select: { id: true, name: true } })).map(
      (u) => [u.id, u.name],
    ),
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Referrals</h1>
        <p className="mt-1 text-[14px] text-[var(--text-muted)]">
          Program is <strong>{settings.referralEnabled ? "on" : "off"}</strong> · rewards fire on{" "}
          <strong>{settings.referralTrigger.replace("_", " ")}</strong> · referrer{" "}
          <strong>{settings.referralRewardReferrer}</strong> credits, new user{" "}
          <strong>{settings.referralRewardReferee}</strong>. Edit in Site Settings.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Total referrals" value={referrals.length} />
        <Stat label="Converted" value={converted} />
        <Stat label="Rewards granted" value={rewardAgg._count} />
        <Stat label="Bonus credits issued" value={rewardAgg._sum.aiCredits ?? 0} />
      </div>

      {topReferrers.length > 0 && (
        <Card>
          <CardContent className="pt-5">
            <p className="mb-2 text-[13px] font-semibold text-[var(--text)]">Top referrers</p>
            <ul className="space-y-1 text-[14px] text-[var(--text-muted)]">
              {topReferrers.map((t) => (
                <li key={t.referrerId}>
                  {referrerNames[t.referrerId] ?? t.referrerId} — {t._count} referral{t._count === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <AdminToolbar
        searchPlaceholder="(search n/a — filter by status)"
        exportType="referrals"
        filters={[
          { key: "status", label: "Status", options: [
            { value: "signed_up", label: "signed up" },
            { value: "converted", label: "converted" },
            { value: "void", label: "void" },
          ] },
        ]}
      />

      <Table>
        <THead>
          <TR>
            <TH>Referrer</TH>
            <TH>Referee</TH>
            <TH>Status</TH>
            <TH>Rewarded</TH>
            <TH>When</TH>
          </TR>
        </THead>
        <tbody>
          {referrals.map((r) => (
            <TR key={r.id}>
              <TD>
                <p className="font-medium text-[var(--text)]">{r.referrer.name}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">{r.referrer.email}</p>
              </TD>
              <TD>
                <p className="text-[var(--text)]">{r.referee?.name ?? r.refereeEmail ?? "—"}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">{r.referee?.email ?? ""}</p>
              </TD>
              <TD>
                <Badge tone={r.status === "converted" ? "success" : r.status === "void" ? "danger" : "neutral"}>
                  {r.status.replace("_", " ")}
                </Badge>
              </TD>
              <TD className="text-[13px] text-[var(--text-muted)]">
                {r.rewardedReferrer ? "referrer" : "—"} / {r.rewardedReferee ? "new user" : "—"}
              </TD>
              <TD className="text-[var(--text-subtle)]">{formatDate(r.createdAt)}</TD>
            </TR>
          ))}
          {referrals.length === 0 && (
            <TR><TD colSpan={5} className="py-8 text-center text-[var(--text-subtle)]">No referrals match.</TD></TR>
          )}
        </tbody>
      </Table>

      <Pagination page={query.page} perPage={query.perPage} total={total} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[12px] font-bold uppercase tracking-wide text-[var(--text-subtle)]">{label}</p>
      <p className="mt-1 text-[22px] font-extrabold text-[var(--text)]">{value.toLocaleString()}</p>
    </div>
  );
}
