"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { fileRightsRequestAction, withdrawAffiliateConsentAction } from "@/app/actions/privacy";

const CONFIRM: Partial<Record<Parameters<typeof fileRightsRequestAction>[0], string>> = {
  erasure: "Request deletion of your account and data? We'll review and follow up — this doesn't delete anything immediately.",
};

export function RequestButton({ type, label }: { type: "access" | "correction" | "erasure"; label: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => {
        const msg = CONFIRM[type];
        if (msg && !window.confirm(msg)) return;
        start(async () => {
          const res = await fileRightsRequestAction(type);
          toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          if (res.ok) router.refresh();
        });
      }}
    >
      {label}
    </Button>
  );
}

export function ComplaintForm() {
  const [pending, start] = useTransition();
  const [text, setText] = React.useState("");
  const router = useRouter();
  const { toast } = useToast();
  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="What happened, and what would you like us to do about it?"
        rows={3}
      />
      <Button
        size="sm"
        loading={pending}
        disabled={!text.trim()}
        onClick={() =>
          start(async () => {
            const res = await fileRightsRequestAction("complaint", text);
            toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
            if (res.ok) {
              setText("");
              router.refresh();
            }
          })
        }
      >
        Submit complaint
      </Button>
    </div>
  );
}

export function WithdrawAffiliateButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      size="sm"
      variant="ghost"
      loading={pending}
      onClick={() => {
        if (!window.confirm("Withdraw from the Affiliate Program? Your existing link stops generating new commissions.")) return;
        start(async () => {
          const res = await withdrawAffiliateConsentAction();
          toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          if (res.ok) router.refresh();
        });
      }}
    >
      Withdraw from Affiliate Program
    </Button>
  );
}
