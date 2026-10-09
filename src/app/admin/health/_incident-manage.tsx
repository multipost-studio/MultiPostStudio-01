"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { updateIncidentAction } from "@/app/actions/admin-incidents";
import { INCIDENT_STATUSES, POSTMORTEM_MAX } from "@/lib/incident-records";

export type IncidentFollowUp = { ownerId: string | null; status: string; postmortem: string | null };
export type StaffOption = { id: string; name: string };

/** Take ownership of an incident, move it through its follow-up, and write the postmortem. */
export function IncidentManage({ incidentKey, title, current, staff }: { incidentKey: string; title: string; current: IncidentFollowUp | null; staff: StaffOption[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [owner, setOwner] = React.useState(current?.ownerId ?? "");
  const [status, setStatus] = React.useState(current?.status ?? "open");
  const [postmortem, setPostmortem] = React.useState(current?.postmortem ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await updateIncidentAction({ key: incidentKey, title, ownerId: owner || null, status, postmortem: postmortem.trim() ? postmortem : null });
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      }
    } catch {
      toast({ title: "Couldn't save. Try again.", tone: "error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {current ? "Edit" : "Take on"}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="md"
        title="Incident follow-up"
        description={title}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={save}>Save</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`inc-owner-${incidentKey}`}>Owner</Label>
              <Select id={`inc-owner-${incidentKey}`} value={owner} onChange={(e) => setOwner(e.target.value)}>
                <option value="">Nobody yet</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor={`inc-status-${incidentKey}`}>Status</Label>
              <Select id={`inc-status-${incidentKey}`} value={status} onChange={(e) => setStatus(e.target.value)}>
                {INCIDENT_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor={`inc-pm-${incidentKey}`}>Postmortem</Label>
            <Textarea id={`inc-pm-${incidentKey}`} rows={8} value={postmortem} onChange={(e) => setPostmortem(e.target.value)} maxLength={POSTMORTEM_MAX} placeholder="What happened, the impact, the cause, and what changes so it does not happen again." />
            <p className="mt-1 text-right text-[12px] tabular-nums text-[var(--text-muted)]">{postmortem.length}/{POSTMORTEM_MAX}</p>
          </div>
        </div>
      </Modal>
    </>
  );
}
