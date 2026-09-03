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
import { PERMISSIONS } from "@/lib/rbac";
import {
  inviteMemberAction,
  updateMemberRoleAction,
  updateWorkspaceRoleAction,
  removeMemberAction,
  assignCustomRoleAction,
  createCustomRoleAction,
  updateCustomRoleAction,
  deleteCustomRoleAction,
} from "@/app/actions/team";

type CustomRole = { id: string; name: string; permissions: string[]; members: number };

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
  customRoleId: string | null;
  status: string;
};

export function TeamTable({
  members,
  canManage,
  currentUserId,
  roles = [],
}: {
  members: Member[];
  canManage: boolean;
  currentUserId: string;
  roles?: { id: string; name: string }[];
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
          {roles.length > 0 && <TH>Custom role</TH>}
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
              {roles.length > 0 && (
                <TD>
                  {canManage && !self && m.orgRole !== "owner" ? (
                    <Select
                      value={m.customRoleId ?? ""}
                      onChange={(e) => run(() => assignCustomRoleAction(m.userId, e.target.value || null))}
                      className="h-8 w-auto text-[13px]"
                    >
                      <option value="">— none —</option>
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                    </Select>
                  ) : (
                    <span className="text-[var(--text-muted)]">{roles.find((r) => r.id === m.customRoleId)?.name ?? "—"}</span>
                  )}
                </TD>
              )}
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

export function CustomRolesManager({ roles }: { roles: CustomRole[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [name, setName] = React.useState("");
  const [perms, setPerms] = React.useState<Set<string>>(new Set());
  const [pending, setPending] = React.useState(false);

  const openNew = () => { setEditId(null); setName(""); setPerms(new Set()); setOpen(true); };
  const openEdit = (r: CustomRole) => { setEditId(r.id); setName(r.name); setPerms(new Set(r.permissions)); setOpen(true); };

  const toggle = (p: string) =>
    setPerms((s) => {
      const n = new Set(s);
      if (n.has(p)) n.delete(p);
      else n.add(p);
      return n;
    });

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    const res = await fn();
    toast({ title: res.ok ? res.message ?? "Done" : res.error ?? "Failed", tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
    return res;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-[var(--text-muted)]">
          Custom roles replace a member&apos;s base permissions with an explicit list.
        </p>
        <Button size="sm" variant="secondary" onClick={openNew}>New role</Button>
      </div>

      {roles.length === 0 ? (
        <p className="text-[13px] text-[var(--text-subtle)]">No custom roles yet.</p>
      ) : (
        <ul className="space-y-2">
          {roles.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
              <button type="button" onClick={() => openEdit(r)} className="min-w-0 text-left">
                <p className="text-[14px] font-medium text-[var(--text)] hover:text-[var(--primary)]">{r.name}</p>
                <p className="text-[12px] text-[var(--text-subtle)]">
                  {r.permissions.length} permission{r.permissions.length === 1 ? "" : "s"} · {r.members} member{r.members === 1 ? "" : "s"}
                </p>
              </button>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => run(() => deleteCustomRoleAction(r.id))}>
                  <Trash2 size={13} />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editId ? "Edit custom role" : "Create custom role"}
        description="Tick every permission this role should grant."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              size="sm"
              loading={pending}
              disabled={!name.trim()}
              onClick={async () => {
                setPending(true);
                const res = await run(() =>
                  editId
                    ? updateCustomRoleAction(editId, { name, permissions: [...perms] })
                    : createCustomRoleAction({ name, permissions: [...perms] }),
                );
                setPending(false);
                if (res.ok) { setOpen(false); setEditId(null); setName(""); setPerms(new Set()); }
              }}
            >
              {editId ? "Save" : "Create"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Client reviewer" />
          </Field>
          <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {PERMISSIONS.filter((p) => p !== "admin.platform").map((p) => (
              <label key={p} className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                <input type="checkbox" checked={perms.has(p)} onChange={() => toggle(p)} className="accent-[var(--primary)]" />
                {p}
              </label>
            ))}
          </div>
        </div>
      </Modal>
    </div>
  );
}
