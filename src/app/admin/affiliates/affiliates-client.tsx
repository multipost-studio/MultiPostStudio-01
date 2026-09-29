"use client";

import * as React from "react";
import { useAdminAction } from "../admin-client";
import { Button } from "@/components/ui/button";
import {
  adminApproveAffiliateAction,
  adminRejectAffiliateAction,
  adminSetAffiliateStatusAction,
  adminApproveCommissionAction,
  adminCreatePayoutAction,
  adminMarkPayoutPaidAction,
} from "@/app/actions/affiliates";

export function ApplicationActions({ id, applicationStatus }: { id: string; applicationStatus: string }) {
  const { busy, run } = useAdminAction();
  if (applicationStatus !== "pending_review") return null;
  return (
    <div className="flex gap-1.5">
      <Button size="sm" loading={busy === "approve"} onClick={() => run("approve", () => adminApproveAffiliateAction(id))}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="ghost"
        loading={busy === "reject"}
        onClick={() => run("reject", () => adminRejectAffiliateAction(id), "Reject this affiliate application?")}
      >
        Reject
      </Button>
    </div>
  );
}

export function StatusActions({ id, status }: { id: string; status: string }) {
  const { busy, run } = useAdminAction();
  return (
    <div className="flex gap-1.5">
      {status !== "suspended" && status !== "terminated" && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "suspend"}
          onClick={() => run("suspend", () => adminSetAffiliateStatusAction(id, "suspended"), "Suspend this affiliate? No new commissions will generate while suspended.")}
        >
          Suspend
        </Button>
      )}
      {status === "suspended" && (
        <Button size="sm" variant="secondary" loading={busy === "reactivate"} onClick={() => run("reactivate", () => adminSetAffiliateStatusAction(id, "active"))}>
          Reactivate
        </Button>
      )}
      {status !== "terminated" && (
        <Button
          size="sm"
          variant="ghost"
          loading={busy === "terminate"}
          onClick={() => run("terminate", () => adminSetAffiliateStatusAction(id, "terminated"), "Terminate this affiliate permanently? This cannot be undone from here.")}
        >
          Terminate
        </Button>
      )}
    </div>
  );
}

export function ApproveCommissionButton({ id }: { id: string }) {
  const { busy, run } = useAdminAction();
  return (
    <Button size="sm" variant="ghost" loading={busy === "approve-comm"} onClick={() => run("approve-comm", () => adminApproveCommissionAction(id))}>
      Approve
    </Button>
  );
}

export function CreatePayoutButton({ affiliateId }: { affiliateId: string }) {
  const { busy, run } = useAdminAction();
  return (
    <Button size="sm" variant="secondary" loading={busy === "payout"} onClick={() => run("payout", () => adminCreatePayoutAction(affiliateId))}>
      Create payout batch
    </Button>
  );
}

export function MarkPayoutPaidButton({ id }: { id: string }) {
  const { busy, run } = useAdminAction();
  return (
    <Button
      size="sm"
      loading={busy === "mark-paid"}
      onClick={() => run("mark-paid", () => adminMarkPayoutPaidAction(id), "Confirm you've already sent this money through your real payout method (bank transfer, PayPal, etc). This only updates the record — it does not send anything.")}
    >
      Mark paid
    </Button>
  );
}
