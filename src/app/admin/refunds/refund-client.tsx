"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/controls";
import { useToast } from "@/components/ui/toast";
import { promptReason } from "@/components/ui/confirm";
import { REASON_MAX, REASON_MIN } from "@/lib/admin-reason";
import { cancelRefundRequestAction, decideRefundAction, requestRefundAction, retryInvoicePaymentAction, setRefundSelfApprovalAction } from "@/app/actions/admin-refunds";

type Res = { ok: true; message: string } | { ok: false; error: string };

function useRun() {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const run = async (fn: () => Promise<Res>) => {
    setBusy(true);
    try {
      const res = await fn();
      toast({ title: res.ok ? res.message : res.error, tone: res.ok ? "success" : "error" });
      if (res.ok) router.refresh();
      return res.ok;
    } catch {
      toast({ title: "Something went wrong. Try again.", tone: "error" });
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

/** Ask for a refund on a paid invoice. Nothing is sent to the gateway until someone else approves. */
export function RequestRefundButton({ invoiceId, number, currency, refundableMajor }: { invoiceId: string; number: string; currency: string; refundableMajor: string }) {
  const { busy, run } = useRun();
  const [open, setOpen] = React.useState(false);
  const [amount, setAmount] = React.useState(refundableMajor);
  const [reason, setReason] = React.useState("");
  const valid = Number(amount) > 0 && reason.trim().length >= REASON_MIN;

  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        Refund…
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        size="sm"
        title={`Request a refund for ${number}`}
        description="Someone else has to approve it before any money moves."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              loading={busy}
              disabled={!valid}
              onClick={async () => {
                if (await run(() => requestRefundAction({ invoiceId, amount }, reason))) setOpen(false);
              }}
            >
              Request refund
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor={`rf-amt-${invoiceId}`}>Amount ({currency.toUpperCase()}, at most {refundableMajor})</Label>
            <Input id={`rf-amt-${invoiceId}`} type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label htmlFor={`rf-why-${invoiceId}`}>Reason</Label>
            <Input id={`rf-why-${invoiceId}`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={REASON_MAX} placeholder="Why is this being refunded?" />
          </div>
        </div>
      </Modal>
    </>
  );
}

/** Ask the gateway to collect an open invoice again. */
export function RetryPaymentButton({ invoiceId }: { invoiceId: string }) {
  const { busy, run } = useRun();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={busy}
      onClick={async () => {
        const reason = await promptReason({ title: "Retry payment", body: "Ask the payment gateway to collect this invoice again now?", confirmLabel: "Retry payment" });
        if (reason) await run(() => retryInvoicePaymentAction(invoiceId, reason));
      }}
    >
      Retry payment
    </Button>
  );
}

export function DecideButtons({ id, label }: { id: string; label: string }) {
  const { busy, run } = useRun();
  const decide = async (decision: "approve" | "reject") => {
    const reason = await promptReason({
      title: decision === "approve" ? "Approve refund" : "Reject refund",
      body: decision === "approve" ? `Approve ${label}? The refund is sent to the payment gateway immediately and can't be undone.` : `Reject ${label}?`,
      confirmLabel: decision === "approve" ? "Approve and refund" : "Reject",
    });
    if (reason) await run(() => decideRefundAction({ id, decision }, reason));
  };
  return (
    <div className="flex gap-1.5">
      <Button size="sm" loading={busy} onClick={() => decide("approve")}>Approve</Button>
      <Button size="sm" variant="secondary" disabled={busy} onClick={() => decide("reject")}>Reject</Button>
    </div>
  );
}

export function WithdrawButton({ id }: { id: string }) {
  const { busy, run } = useRun();
  return (
    <Button size="sm" variant="ghost" loading={busy} onClick={() => run(() => cancelRefundRequestAction(id))}>
      Withdraw
    </Button>
  );
}

export function SelfApprovalToggle({ allowed }: { allowed: boolean }) {
  const { busy, run } = useRun();
  return (
    <div className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-elevated)] p-3">
      <div>
        <p className="text-[14px] font-medium text-[var(--text)]">Allow people to approve their own refund requests</p>
        <p className="max-w-xl text-[13px] text-[var(--text-muted)]">Off by default so that no single person can move money alone. Turn it on only if you are the only person who can approve. Only full administrators can change this.</p>
      </div>
      <Switch
        checked={allowed}
        disabled={busy}
        srLabel="Allow self-approval of refunds"
        onCheckedChange={async (v) => {
          const reason = await promptReason({ title: v ? "Allow self-approval" : "Require a second person", body: v ? "Let a person approve a refund they asked for themselves?" : "Require a different person to approve every refund again?", confirmLabel: "Confirm" });
          if (reason) await run(() => setRefundSelfApprovalAction(v, reason));
        }}
      />
    </div>
  );
}
