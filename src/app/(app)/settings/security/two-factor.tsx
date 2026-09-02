"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { toggle2FAAction } from "@/app/actions/auth";

export function TwoFactorToggle({ enabled }: { enabled: boolean }) {
  const { toast } = useToast();
  const [on, setOn] = React.useState(enabled);
  const [showSetup, setShowSetup] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [pending, setPending] = React.useState(false);

  if (on) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[14px] text-[var(--success)]">
          <ShieldCheck size={16} /> Two-factor authentication is enabled.
        </p>
        <Button
          size="sm"
          variant="ghost"
          loading={pending}
          onClick={async () => {
            setPending(true);
            const res = await toggle2FAAction(false);
            setPending(false);
            if (res.ok) setOn(false);
            toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          }}
        >
          Disable 2FA
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!showSetup ? (
        <Button size="sm" onClick={() => setShowSetup(true)}>
          Enable 2FA
        </Button>
      ) : (
        <>
          <p className="text-[14px] text-[var(--text-muted)]">
            Scan a QR in your authenticator app, then enter the 6-digit code.
            <br />
            <span className="text-[13px] text-[var(--text-subtle)]">For this demo, enter <span className="font-mono">123456</span>.</span>
          </p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="123456" maxLength={6} className="w-32" />
            <Button
              size="sm"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const res = await toggle2FAAction(true, code);
                setPending(false);
                if (res.ok) setOn(true);
                toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
              }}
            >
              Verify & enable
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
