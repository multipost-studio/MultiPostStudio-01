"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select, Textarea, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  assignAdminRoleAction,
  createCustomRoleAction,
  deleteCustomRoleAction,
  revokeAdminRoleAction,
  updateCustomRoleAction,
} from "@/app/actions/admin-access";

export type RoleRow = { id: string | null; key: string; name: string; description: string; permissions: string[]; system: boolean; members: number };
export type StaffRow = {
  id: string;
  name: string;
  email: string;
  level: "full" | "support" | "scoped";
  suspended: boolean;
  assignments: { id: string; roleKey: string; roleName: string; reason: string; expiresAt: string | null; expired: boolean }[];
};
type Perm = { key: string; label: string; module: string; sensitive: boolean };
type Res = { ok: true; message?: string } | { ok: false; error: string };

const LEVEL_LABEL = { full: "Full administrator", support: "Support (built-in)", scoped: "Role-based" } as const;

export function AccessClient({ staff, roles, permissions }: { staff: StaffRow[]; roles: RoleRow[]; permissions: Perm[]; customPrefix: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [editing, setEditing] = React.useState<RoleRow | "new" | null>(null);
  const [revoking, setRevoking] = React.useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = React.useState<RoleRow | null>(null);

  async function run(fn: () => Promise<Res>, after?: () => void) {
    setBusy(true);
    try {
      const res = await fn();
      if (res.ok) {
        toast({ title: res.message ?? "Saved", tone: "success" });
        after?.();
        router.refresh();
      } else toast({ title: res.error, tone: "error" });
    } catch {
      toast({ title: "Something went wrong. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <AssignForm roles={roles} busy={busy} onSubmit={(v) => run(() => assignAdminRoleAction(v))} />

      <section className="space-y-2">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Staff ({staff.length})</h2>
        <div className="divide-y divide-[var(--border)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)]">
          {staff.map((s) => (
            <div key={s.id} className="flex flex-wrap items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-[14px] font-medium text-[var(--text)]">{s.name || s.email}</span>
                  <Badge tone={s.level === "full" ? "primary" : "neutral"}>{LEVEL_LABEL[s.level]}</Badge>
                  {s.suspended && <Badge tone="danger">suspended</Badge>}
                </div>
                <div className="text-[13px] text-[var(--text-muted)]">{s.email}</div>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {s.assignments.length === 0 && s.level !== "full" && <span className="text-[13px] text-[var(--text-muted)]">No active roles</span>}
                {s.assignments.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[12.5px] text-[var(--text)]" title={a.reason}>
                    {a.roleName}
                    {a.expiresAt && <span className="text-[var(--text-muted)]">{a.expired ? "expired" : `until ${a.expiresAt.slice(0, 10)}`}</span>}
                    <button type="button" className="text-[var(--danger)] hover:underline" onClick={() => setRevoking({ id: a.id, label: `${a.roleName} from ${s.email}` })}>
                      Revoke
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Roles</h2>
          <Button size="sm" onClick={() => setEditing("new")}>New custom role</Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {roles.map((r) => (
            <div key={r.key} className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium text-[var(--text)]">{r.name}</span>
                  <Badge tone={r.system ? "info" : "accent"}>{r.system ? "built-in" : "custom"}</Badge>
                </div>
                <span className="text-[12.5px] text-[var(--text-muted)]">{r.members} active</span>
              </div>
              <p className="mt-1 text-[13px] text-[var(--text-muted)]">{r.description || "No description"}</p>
              <p className="mt-2 text-[12.5px] text-[var(--text-muted)]">{r.permissions.length} permissions</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>{r.system ? "View" : "Edit"}</Button>
                {!r.system && <Button size="sm" variant="secondary" onClick={() => setDeleting(r)}>Delete</Button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {editing && (
        <RoleModal
          role={editing === "new" ? null : editing}
          permissions={permissions}
          busy={busy}
          onClose={() => setEditing(null)}
          onSubmit={(v) =>
            run(() => (editing !== "new" && editing.id ? updateCustomRoleAction(editing.id, v) : createCustomRoleAction(v)), () => setEditing(null))
          }
        />
      )}
      {revoking && (
        <ReasonModal
          title="Revoke role"
          description={`Revoke ${revoking.label}. They lose this access immediately.`}
          cta="Revoke"
          busy={busy}
          onClose={() => setRevoking(null)}
          onSubmit={(reason) => run(() => revokeAdminRoleAction(revoking.id, reason), () => setRevoking(null))}
        />
      )}
      {deleting && deleting.id && (
        <ReasonModal
          title="Delete role"
          description={`Delete "${deleting.name}". ${deleting.members} active assignment(s) will be revoked.`}
          cta="Delete role"
          busy={busy}
          onClose={() => setDeleting(null)}
          onSubmit={(reason) => run(() => deleteCustomRoleAction(deleting.id!, reason), () => setDeleting(null))}
        />
      )}
    </div>
  );
}

function AssignForm({ roles, busy, onSubmit }: { roles: RoleRow[]; busy: boolean; onSubmit: (v: { email: string; roleKey: string; expiresInDays: number | null; reason: string }) => void }) {
  const [email, setEmail] = React.useState("");
  const [roleKey, setRoleKey] = React.useState(roles[0]?.key ?? "");
  const [days, setDays] = React.useState("");
  const [reason, setReason] = React.useState("");
  const d = days.trim() === "" ? null : Number(days);
  const valid = email.includes("@") && roleKey && reason.trim().length >= 8 && (d === null || (Number.isInteger(d) && d >= 1 && d <= 365));
  return (
    <form
      className="grid gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3 md:grid-cols-[1.4fr_1fr_8rem]"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        onSubmit({ email: email.trim(), roleKey, expiresInDays: d, reason: reason.trim() });
        setEmail("");
        setReason("");
        setDays("");
      }}
    >
      <div className="md:col-span-3">
        <h2 className="text-[15px] font-semibold text-[var(--text)]">Give someone admin access</h2>
        <p className="text-[13px] text-[var(--text-muted)]">They need an existing, verified account. Access can be time-limited.</p>
      </div>
      <div>
        <Label htmlFor="acc-email">Account email</Label>
        <Input id="acc-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" autoComplete="off" />
      </div>
      <div>
        <Label htmlFor="acc-role">Role</Label>
        <Select id="acc-role" value={roleKey} onChange={(e) => setRoleKey(e.target.value)}>
          {roles.map((r) => (
            <option key={r.key} value={r.key}>{r.name}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="acc-days">Expires (days)</Label>
        <Input id="acc-days" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value.replace(/\D/g, ""))} placeholder="never" />
      </div>
      <div className="md:col-span-3">
        <Label htmlFor="acc-reason">Reason</Label>
        <Input id="acc-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why does this person need this access? (min 8 characters)" maxLength={300} />
      </div>
      <div className="md:col-span-3">
        <Button type="submit" disabled={!valid || busy}>Give access</Button>
      </div>
    </form>
  );
}

function RoleModal({ role, permissions, busy, onClose, onSubmit }: { role: RoleRow | null; permissions: Perm[]; busy: boolean; onClose: () => void; onSubmit: (v: { name: string; description: string; permissions: string[]; reason: string }) => void }) {
  const readOnly = !!role?.system;
  const [name, setName] = React.useState(role?.name ?? "");
  const [description, setDescription] = React.useState(role?.description ?? "");
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set(role?.permissions ?? []));
  const [reason, setReason] = React.useState("");
  const toggle = (k: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  const groups = [...new Set(permissions.map((p) => p.module))];
  const valid = name.trim().length >= 3 && selected.size > 0 && reason.trim().length >= 8;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={readOnly ? `${role!.name} (built-in)` : role ? "Edit custom role" : "New custom role"}
      description={readOnly ? "Built-in roles are defined in code and can't be edited." : "Pick only what this role needs. Sensitive actions are marked."}
      footer={
        readOnly ? (
          <Button variant="secondary" onClick={onClose}>Close</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!valid || busy} onClick={() => onSubmit({ name: name.trim(), description: description.trim(), permissions: [...selected], reason: reason.trim() })}>Save role</Button>
          </>
        )
      }
    >
      <div className="space-y-3">
        {!readOnly && (
          <>
            <div>
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
            </div>
            <div>
              <Label htmlFor="role-desc">Description</Label>
              <Textarea id="role-desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} />
            </div>
          </>
        )}
        <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">{g}</div>
              <div className="space-y-1">
                {permissions
                  .filter((p) => p.module === g)
                  .map((p) => (
                    <label key={p.key} className="flex items-start gap-2 text-[13.5px] text-[var(--text)]">
                      <input type="checkbox" className="mt-1" checked={selected.has(p.key)} disabled={readOnly} onChange={() => toggle(p.key)} />
                      <span>
                        {p.label}
                        {p.sensitive && <span className="ml-1.5 text-[11.5px] text-[var(--danger)]">sensitive</span>}
                      </span>
                    </label>
                  ))}
              </div>
            </div>
          ))}
        </div>
        {!readOnly && (
          <div>
            <Label htmlFor="role-reason">Reason for this change</Label>
            <Input id="role-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="At least 8 characters" />
          </div>
        )}
      </div>
    </Modal>
  );
}

function ReasonModal({ title, description, cta, busy, onClose, onSubmit }: { title: string; description: string; cta: string; busy: boolean; onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = React.useState("");
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={reason.trim().length < 8 || busy} onClick={() => onSubmit(reason.trim())}>{cta}</Button>
        </>
      }
    >
      <Label htmlFor="reason-input">Reason</Label>
      <Input id="reason-input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="At least 8 characters" />
    </Modal>
  );
}
