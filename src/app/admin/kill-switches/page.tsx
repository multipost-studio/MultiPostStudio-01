import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getStaffPermissions, requireAdminPermission } from "@/lib/session";
import { KILL_KINDS, SCOPE_TYPES, isLive } from "@/lib/kill-switches";
import { PLATFORMS } from "@/lib/constants";
import { AI_PROVIDER_IDS } from "@/lib/ai/providers/registry";
import { formatDate, relativeTime } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CreateSwitch, LiftButton } from "./kill-switch-client";

export const metadata: Metadata = { title: "Admin · Pauses" };
export const dynamic = "force-dynamic";

export default async function KillSwitchesPage() {
  await requireAdminPermission("flags.view");
  const canManage = (await getStaffPermissions()).has("flags.manage");
  const now = new Date();
  const rows = await db.killSwitch.findMany({ orderBy: { createdAt: "desc" }, take: 80 }).catch(() => null);
  const orgIds = [...new Set((rows ?? []).filter((r) => r.scopeType === "org" && r.scopeValue).map((r) => r.scopeValue!))];
  const orgs = orgIds.length ? await db.organization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } }) : [];
  const staffIds = [...new Set((rows ?? []).flatMap((r) => [r.createdById, r.revokedById]).filter((x): x is string => !!x))];
  const staff = staffIds.length ? await db.user.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true, email: true } }) : [];
  const who = (id: string | null) => (id ? staff.find((s) => s.id === id)?.name || staff.find((s) => s.id === id)?.email || "Former staff member" : "—");
  const scopeText = (r: { scopeType: string; scopeValue: string | null }) =>
    r.scopeType === "platform" ? "Everyone" : r.scopeType === "org" ? `Organization: ${orgs.find((o) => o.id === r.scopeValue)?.name ?? r.scopeValue}` : `Provider: ${PLATFORMS[r.scopeValue as keyof typeof PLATFORMS]?.label ?? r.scopeValue}`;
  const kindLabel = (k: string) => KILL_KINDS.find((x) => x.id === k)?.label ?? k;
  const active = (rows ?? []).filter((r) => isLive(r, now));
  const past = (rows ?? []).filter((r) => !isLive(r, now)).slice(0, 20);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[var(--text)]">Pauses</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-[var(--text-muted)]">
          Switch off AI features or publishing for everyone, for one organization, or for one provider or platform. A pause takes effect within about 15 seconds. Paused publishing is held, not failed: posts stay scheduled and go out when the pause ends. Customers see a generic notice, never your reason. The platform-wide feature flags are on the Feature Flags page.
        </p>
      </div>

      {rows === null ? (
        <p role="alert" className="rounded-[var(--radius-md)] border border-[var(--warning)] p-3 text-[14px]">
          Pauses aren&apos;t available yet. If this is a new deploy, check that the latest database migration (admin money and controls) has been applied.
        </p>
      ) : (
        <>
          {canManage && <CreateSwitch aiProviders={[...AI_PROVIDER_IDS]} platforms={Object.entries(PLATFORMS).map(([id, p]) => ({ id, label: p.label }))} kinds={KILL_KINDS.map((k) => ({ id: k.id, label: k.label }))} scopes={SCOPE_TYPES.map((s) => ({ id: s.id, label: s.label }))} />}

          <section className="space-y-2">
            <h2 className="text-[15px] font-semibold text-[var(--text)]">Active ({active.length})</h2>
            {active.length === 0 ? (
              <p className="text-[14px] text-[var(--text-muted)]">Nothing is paused.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
                {active.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-[14px] text-[var(--text)]">
                        <Badge tone="danger">{kindLabel(r.kind)} paused</Badge>
                        <span>{scopeText(r)}</span>
                      </div>
                      <p className="text-[13px] text-[var(--text-muted)]">“{r.reason}”</p>
                      <p className="text-[12.5px] text-[var(--text-muted)]">
                        By {who(r.createdById)} {relativeTime(r.createdAt)} · {r.expiresAt ? `ends ${formatDate(r.expiresAt)}` : "no end date"}
                      </p>
                    </div>
                    {canManage && <LiftButton id={r.id} />}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {past.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-[15px] font-semibold text-[var(--text)]">Earlier</h2>
              <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
                {past.map((r) => (
                  <li key={r.id} className="p-3 text-[13px] text-[var(--text-muted)]">
                    <span className="text-[var(--text)]">{kindLabel(r.kind)} · {scopeText(r)}</span> · “{r.reason}” · {r.revokedAt ? `lifted ${relativeTime(r.revokedAt)} by ${who(r.revokedById)}` : `expired ${r.expiresAt ? formatDate(r.expiresAt) : ""}`}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
