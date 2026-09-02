"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input, Select, Field } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Table, THead, TR, TH, TD } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { ORG_ROLES, WORKSPACE_ROLES, ROLE_LABELS } from "@/lib/constants";
import { inviteMemberAction, updateMemberRoleAction, updateWorkspaceRoleAction, removeMemberAction } from "@/app/actions/team";

export function InviteButton() {
  const [open, setOpen] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const { toast } = useToast();
  const router = useRouter();

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <UserPlus size={15} /> Invite member
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Invite a team member"
        description="They'll get access to this workspace. Set their org-level role here."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="invite" loading={pending}>Send invite</Button>
          </>
        }
      >
        <form
          id="invite"
          className="space-y-3"
          action={async (fd) => {
            setPending(true);
            const res = await inviteMemberAction(null, fd);
            setPending(false);
            toast({ title: res.ok ? res.message ?? "Invited" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setOpen(false); router.refresh(); }
          }}
        >
          <Field label="Full name">
            <Input name="name" required />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Org role">
            <Select name="orgRole" defaultValue="creator">
              {ORG_ROLES.filter((r) => r !== "owner").map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </Select>
          </Field>
        </form>
      </Modal>
    </>
  );
}

type Member = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  orgRole: string;
  wsRole: string | null;
  status: string;
};

export function TeamTable({
  members,
  canManage,
  currentUserId,
}: {
  members: Member[];
  canManage: boolean;
  currentUserId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    const res = await fn();
    toast({ title: res.ok ? res.message ?? "Updated" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
    router.refresh();
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Member</TH>
          <TH>Org role</TH>
          <TH>Workspace role</TH>
          <TH></TH>
        </TR>
      </THead>
      <tbody>
        {members.map((m) => {
          const self = m.userId === currentUserId;
          return (
            <TR key={m.userId}>
              <TD>
                <div className="flex items-center gap-2">
                  <Avatar name={m.name} src={m.image} size={28} />
                  <div>
                    <p className="font-medium text-[var(--text)]">
                      {m.name} {self && <span className="text-[var(--text-subtle)]">(you)</span>}
                    </p>
                    <p className="text-[12px] text-[var(--text-subtle)]">{m.email}</p>
                  </div>
                  {m.status === "suspended" && <Badge tone="danger">Suspended</Badge>}
                </div>
              </TD>
              <TD>
                {canManage && !self && m.orgRole !== "owner" ? (
                  <Select
                    value={m.orgRole}
                    onChange={(e) => run(() => updateMemberRoleAction(m.userId, e.target.value))}
                    className="h-8 w-auto text-[13px]"
                  >
                    {ORG_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                ) : (
                  <Badge tone={m.orgRole === "owner" ? "primary" : "neutral"}>{ROLE_LABELS[m.orgRole] ?? m.orgRole}</Badge>
                )}
              </TD>
              <TD>
                {canManage ? (
                  <Select
                    value={m.wsRole ?? ""}
                    onChange={(e) => run(() => updateWorkspaceRoleAction(m.userId, e.target.value))}
                    className="h-8 w-auto text-[13px]"
                  >
                    <option value="">(inherit org role)</option>
                    {WORKSPACE_ROLES.map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                ) : (
                  <span className="text-[var(--text-muted)]">{m.wsRole ? ROLE_LABELS[m.wsRole] : "inherit"}</span>
                )}
              </TD>
              <TD className="text-right">
                {canManage && !self && m.orgRole !== "owner" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remove"
                    onClick={() => run(() => removeMemberAction(m.userId))}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </TD>
            </TR>
          );
        })}
      </tbody>
    </Table>
  );
}
