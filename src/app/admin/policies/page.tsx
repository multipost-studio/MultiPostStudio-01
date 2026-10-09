import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStaffPermissions, requireAdminPermission } from "@/lib/session";
import { POLICY_TYPES, inForce, isUpcoming } from "@/lib/policy-versions";
import { todayDay } from "@/lib/date-range";
import { formatDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { PublishPolicyForm } from "./publish-form";

export const metadata: Metadata = { title: "Admin · Policies" };
export const dynamic = "force-dynamic";

export default async function PoliciesPage() {
  await requireAdminPermission("privacy.view");
  const canManage = (await getStaffPermissions()).has("privacy.manage");
  const now = new Date();
  const rows = await db.policyVersion.findMany({ orderBy: [{ type: "asc" }, { effectiveAt: "desc" }], take: 300 }).catch(() => null);
  const staffIds = [...new Set((rows ?? []).map((r) => r.publishedById).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name || staff.find((s) => s.id === id)?.email || "Former staff member" : "—");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Policies</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          The published versions of your terms, privacy policy and other documents, and which one is in force today. Versions are never edited or removed: a correction is a new version. This keeps the record only; it does not show the policy to customers or track who accepted it.
        </p>
      </div>

      {rows === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">
          This page isn&apos;t available yet. If this is a new deploy, check that the latest database migration (admin governance) has been applied.
        </p>
      ) : (
        <>
          {canManage && <PublishPolicyForm today={todayDay(now)} />}
          {POLICY_TYPES.map((t) => {
            const list = rows.filter((r) => r.type === t.id);
            if (list.length === 0 && t.id === "other") return null;
            const current = inForce(list, t.id, now);
            return (
              <section key={t.id} className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-[var(--text)]">{t.label}</h2>
                  {current ? <Badge tone="success">in force: v{current.version}</Badge> : <Badge tone="neutral">nothing recorded</Badge>}
                </div>
                {list.length > 0 && (
                  <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
                    {list.map((r) => (
                      <li key={r.id} className="space-y-1 p-3">
                        <div className="flex flex-wrap items-center gap-2 text-[14px] text-[var(--text)]">
                          <span className="font-medium">v{r.version}</span>
                          <span className="text-[var(--text-muted)]">{r.title}</span>
                          {isUpcoming(r, now) && <Badge tone="info">upcoming</Badge>}
                          {current?.version === r.version && <Badge tone="success">in force</Badge>}
                        </div>
                        <p className="text-[13px] text-[var(--text-muted)]">{r.summary}</p>
                        <p className="text-[12.5px] text-[var(--text-muted)]">
                          Effective {formatDate(r.effectiveAt)} · published by {who(r.publishedById)}
                          {r.url && (
                            <>
                              {" · "}
                              <a href={r.url} className="underline" rel="noopener noreferrer" target={r.url.startsWith("/") ? undefined : "_blank"}>
                                view document
                              </a>
                            </>
                          )}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
