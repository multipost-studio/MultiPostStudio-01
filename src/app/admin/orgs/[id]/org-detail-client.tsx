"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive, promptReason } from "@/components/ui/confirm";
import { REASON_MAX, REASON_MIN } from "@/lib/admin-reason";
import { PLAN_KEYS } from "@/lib/constants";
import {
  adminSetOrgPlanAction,
  setOrgSuspendedAction,
  deleteOrgAction,
  restoreOrgAction,
  adjustOrgCreditsAction,
  updateOrgDetailsAction,
} from "@/app/actions/admin";

type Res = { ok: boolean; error?: string; message?: string };

export function OrgDetailHeaderActions({
  org,
}: {
  org: {
    id: string;
    name: string;
    slug: string;
    type: string;
    isSuspended: boolean;
    isDeleted: boolean;
    currentPlanKey: string;
    creditBalance: number;
    billingName?: string | null;
    billingEmail?: string | null;
    billingCountry?: string | null;
    taxId?: string | null;
  };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState<string | null>(null);

  // Credit adjustment state
  const [creditDialogOpen, setCreditDialogOpen] = React.useState(false);
  const [creditAmount, setCreditAmount] = React.useState("500");
  const [creditReason, setCreditReason] = React.useState("");

  // Edit details state
  const [editDialogOpen, setEditDialogOpen] = React.useState(false);
  const [name, setName] = React.useState(org.name);
  const [slug, setSlug] = React.useState(org.slug);
  const [type, setType] = React.useState(org.type);
  const [billingName, setBillingName] = React.useState(org.billingName ?? "");
  const [billingEmail, setBillingEmail] = React.useState(org.billingEmail ?? "");
  const [billingCountry, setBillingCountry] = React.useState(org.billingCountry ?? "");
  const [taxId, setTaxId] = React.useState(org.taxId ?? "");

  const run = async (key: string, fn: () => Promise<Res>, confirmMsg?: string) => {
    if (
      confirmMsg &&
      !(await confirmDestructive({
        title: "Please confirm",
        body: confirmMsg,
        confirmLabel: "Confirm",
      }))
    ) {
      return;
    }
    setBusy(key);
    try {
      const res = await fn();
      toast({
        title: res.ok ? res.message ?? "Done" : res.error ?? "Failed",
        tone: res.ok ? "success" : "error",
      });
      if (res.ok) router.refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "An unexpected error occurred";
      toast({ title: msg, tone: "error" });
    } finally {
      setBusy(null);
    }
  };

  const handleAdjustCredits = async () => {
    const val = Number(creditAmount);
    if (isNaN(val)) return;
    setBusy("credits");
    const res = await adjustOrgCreditsAction(org.id, val, creditReason);
    setBusy(null);
    setCreditDialogOpen(false);
    toast({
      title: res.ok ? res.message ?? "Credits updated" : res.error ?? "Failed",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  const handleUpdateDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    const reason = await promptReason({ title: "Save organization details", body: "Changing the name, slug or billing details affects invoices and links.", confirmLabel: "Save changes" });
    if (!reason) return;
    setBusy("update");
    const res = await updateOrgDetailsAction(org.id, {
      name,
      slug,
      type,
      billingName,
      billingEmail,
      billingCountry,
      taxId,
    }, reason);
    setBusy(null);
    setEditDialogOpen(false);
    toast({
      title: res.ok ? (res.message ?? "Details updated") : (res.error ?? "Failed to update details"),
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  /** Ask for a written reason first (recorded in the audit log), then run. Nothing happens if the person cancels. */
  const runWithReason = async (key: string, fn: (reason: string) => Promise<Res>, body: string | undefined, title = "Please confirm") => {
    const reason = await promptReason({ title, body: body ?? "Confirm this change. Your reason is saved in the audit log.", confirmLabel: "Confirm" });
    if (reason) await run(key, () => fn(reason));
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setEditDialogOpen(true)}>
          Edit Metadata
        </Button>

        <Button size="sm" variant="outline" onClick={() => setCreditDialogOpen(true)}>
          Adjust Credits
        </Button>

        {!org.isDeleted && (
          <Button
            size="sm"
            variant={org.isSuspended ? "secondary" : "ghost"}
            loading={busy === "sus"}
            onClick={() =>
              runWithReason("sus", (r) => setOrgSuspendedAction(org.id, !org.isSuspended, r), org.isSuspended ? undefined : `Suspend ${org.name}? All members' access will be locked.`)
            }
          >
            {org.isSuspended ? "Restore Organization" : "Suspend Organization"}
          </Button>
        )}

        {org.isDeleted ? (
          <Button
            size="sm"
            variant="outline"
            loading={busy === "restore"}
            onClick={() => runWithReason("restore", (r) => restoreOrgAction(org.id, r), "Confirm this change. Your reason is saved in the audit log.")}
          >
            Undelete Org
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            className="text-[var(--danger)] hover:bg-[var(--danger)]/10"
            loading={busy === "del"}
            onClick={() =>
              runWithReason("del", (r) => deleteOrgAction(org.id, r), `Soft-delete organization ${org.name}? All active workspace operations will be suspended.`)
            }
          >
            Delete Org
          </Button>
        )}
      </div>

      {/* Credit Dialog Modal */}
      <Modal
        open={creditDialogOpen}
        onClose={() => setCreditDialogOpen(false)}
        title="Adjust Account Credits"
        description={`Current balance: ${org.creditBalance} credits. Enter a positive amount to grant or a negative amount to deduct.`}
        size="sm"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setCreditDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" loading={busy === "credits"} disabled={Number.isNaN(Number(creditAmount)) || creditAmount.trim() === "" || creditReason.trim().length < REASON_MIN} onClick={handleAdjustCredits}>
              Save Adjustment
            </Button>
          </>
        }
      >
        <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-[var(--text-subtle)]">Credit Delta</label>
                <Input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(e.target.value)}
                  placeholder="e.g. 500 or -200"
                  className="mt-1"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-[var(--text-subtle)]">Audit Reason / Note</label>
                <Input
                  value={creditReason}
                  onChange={(e) => setCreditReason(e.target.value)}
                  placeholder={`Why? At least ${REASON_MIN} characters, e.g. Support goodwill for the Oct 3 outage`}
                  maxLength={REASON_MAX}
                  className="mt-1"
                />
              </div>
            </div>
      </Modal>

      {/* Edit Details Dialog Modal */}
      <Modal
        open={editDialogOpen}
        onClose={() => setEditDialogOpen(false)}
        title="Edit Organization Details"
        size="md"
        footer={
          <>
            <Button size="sm" variant="ghost" type="button" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" form="org-edit-form" loading={busy === "update"}>
              Save Changes
            </Button>
          </>
        }
      >
        <form id="org-edit-form" onSubmit={handleUpdateDetails} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-subtle)]">Organization Name</label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-subtle)]">Slug (URL safe)</label>
                  <Input value={slug} onChange={(e) => setSlug(e.target.value)} required className="mt-1" />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-subtle)]">Org Type</label>
                <Select value={type} onChange={(e) => setType(e.target.value)} className="mt-1">
                  <option value="creator">Creator</option>
                  <option value="business">Business</option>
                  <option value="agency">Agency</option>
                  <option value="marketing_team">Marketing Team</option>
                  <option value="enterprise">Enterprise</option>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-subtle)]">Billing Name</label>
                  <Input value={billingName} onChange={(e) => setBillingName(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-subtle)]">Billing Email</label>
                  <Input value={billingEmail} type="email" onChange={(e) => setBillingEmail(e.target.value)} className="mt-1" />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-[var(--text-subtle)]">Country Code</label>
                  <Input value={billingCountry} onChange={(e) => setBillingCountry(e.target.value)} placeholder="e.g. US, IN, GB" className="mt-1" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-[var(--text-subtle)]">Tax ID / VAT</label>
                  <Input value={taxId} onChange={(e) => setTaxId(e.target.value)} placeholder="e.g. US12345678" className="mt-1" />
                </div>
              </div>
        </form>
      </Modal>
    </>
  );
}

export function OrgPlanSwitcher({
  orgId,
  currentPlanKey,
}: {
  orgId: string;
  currentPlanKey: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [plan, setPlan] = React.useState(currentPlanKey);
  const [interval, setInterval] = React.useState<"month" | "year">("month");
  const [loading, setLoading] = React.useState(false);

  const handlePlanChange = async () => {
    const reason = await promptReason({
      title: "Override Plan",
      body: `Override this organization's subscription plan to ${plan} (${interval}ly)? This will immediately update all system quotas.`,
      confirmLabel: "Apply Plan",
    });
    if (!reason) return;
    setLoading(true);
    const res = await adminSetOrgPlanAction(orgId, plan, interval, reason);
    setLoading(false);
    toast({
      title: res.ok ? res.message ?? "Plan updated" : res.error ?? "Failed",
      tone: res.ok ? "success" : "error",
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select aria-label="Plan" value={plan} size="sm" className="w-auto" onChange={(e) => setPlan(e.target.value)}>
        {PLAN_KEYS.map((k) => (
          <option key={k} value={k}>
            {k.toUpperCase()}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Billing interval"
        value={interval}
        size="sm"
        className="w-auto"
        onChange={(e) => setInterval(e.target.value as "month" | "year")}
      >
        <option value="month">Monthly</option>
        <option value="year">Annual</option>
      </Select>
      <Button size="sm" variant="secondary" loading={loading} onClick={handlePlanChange}>
        Apply Plan
      </Button>
    </div>
  );
}
