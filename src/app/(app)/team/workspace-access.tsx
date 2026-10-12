"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { addWorkspaceMemberAction, removeWorkspaceMemberAction, setWorkspaceRestrictedAction } from "@/app/actions/team";

type AccessMember = { userId: string; name: string; email: string; image: string | null; orgRole: string; hasRow: boolean };

/**
 * Who can open this workspace. Open (the default): every member of the organisation. Restricted: owners and admins,
 * plus the people listed here as having access. Owners and admins can restrict it; anyone who manages members can
 * grant or take away access once it is restricted.
 */
export function WorkspaceAccess({
  restricted,
  canRestrict,
  canManage,
  currentUserId,
  members,
}: {
  restricted: boolean;
  canRestrict: boolean;
  canManage: boolean;
  currentUserId: string;
  members: AccessMember[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(key);
    const res = await fn();
    setBusy(null);
    toast({ title: res.ok ? res.message ?? "Updated" : "Couldn't update access", description: res.error, tone: res.ok ? "success" : "error" });
    router.refresh();
  }

  const always = (role: string) => role === "owner" || role === "admin";
  const withAccess = members.filter((m) => always(m.orgRole) || m.hasRow).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[14px] font-semibold text-[var(--text)]">
            {restricted ? <Lock size={15} /> : <Unlock size={15} />}
            {restricted ? "Restricted workspace" : "Open to the whole team"}
          </p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">
            {restricted
              ? `Only owners, admins and the people below can open this workspace (${withAccess} of ${members.length} can right now). Everyone else does not see it in the switcher.`
              : "Every member of the organisation can open this workspace with their organisation role. Restrict it to keep it away from colleagues who work on other clients."}
          </p>
        </div>
        {canRestrict && (
          <Button
            size="sm"
            variant={restricted ? "secondary" : "primary"}
            loading={busy === "toggle"}
            onClick={() => run("toggle", () => setWorkspaceRestrictedAction(!restricted))}
          >
            {restricted ? "Open to the whole team" : "Restrict this workspace"}
          </Button>
        )}
      </div>

      {restricted && (
        <ul className="divide-y divide-[var(--border)] rounded-[var(--radius-md)] border border-[var(--border)]">
          {members.map((m) => {
            const fixed = always(m.orgRole);
            const has = fixed || m.hasRow;
            return (
              <li key={m.userId} className="flex items-center gap-3 px-3.5 py-2.5">
                <Avatar name={m.name} src={m.image ?? undefined} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium text-[var(--text)]">{m.name}</p>
                  <p className="truncate text-[12px] text-[var(--text-subtle)]">{m.email}</p>
                </div>
                {fixed ? (
                  <Badge tone="neutral">Always ({m.orgRole})</Badge>
                ) : has ? (
                  <>
                    <Badge tone="success">Has access</Badge>
                    {canManage && m.userId !== currentUserId && (
                      <Button size="sm" variant="ghost" loading={busy === m.userId} onClick={() => run(m.userId, () => removeWorkspaceMemberAction(m.userId))}>
                        Remove
                      </Button>
                    )}
                  </>
                ) : (
                  <>
                    <Badge tone="warning">No access</Badge>
                    {canManage && (
                      <Button size="sm" variant="secondary" loading={busy === m.userId} onClick={() => run(m.userId, () => addWorkspaceMemberAction(m.userId))}>
                        Give access
                      </Button>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
