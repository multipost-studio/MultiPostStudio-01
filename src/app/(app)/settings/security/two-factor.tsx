"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { startTwoFactorSetupAction, confirmTwoFactorSetupAction, disableTwoFactorAction } from "@/app/actions/auth";

export function TwoFactorToggle({ enabled, hasPassword }: { enabled: boolean; hasPassword: boolean }) {
  const { toast } = useToast();
  const [on, setOn] = React.useState(enabled);
  const [setup, setSetup] = React.useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [pending, setPending] = React.useState(false);

  async function beginSetup() {
    setPending(true);
    const res = await startTwoFactorSetupAction(password ? { password } : undefined);
    setPending(false);
    if (res.ok) {
      setSetup({ secret: res.secret, qrDataUrl: res.qrDataUrl });
    } else {
      toast({ title: res.error, tone: "error" });
    }
  }

  if (on) {
    return (
      <div className="space-y-3">
        <p className="flex items-center gap-2 text-[14px] text-[var(--success)]">
          <ShieldCheck size={16} /> Two-factor authentication is enabled.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasPassword && (
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-44"
            />
          )}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="Authenticator code"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
            className="w-40"
          />
          <Button
            size="sm"
            variant="ghost"
            loading={pending}
            onClick={async () => {
              setPending(true);
              const res = await disableTwoFactorAction({ password: password || undefined, code });
              setPending(false);
              if (res.ok) {
                setOn(false);
                setCode("");
                setPassword("");
              }
              toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
            }}
          >
            Disable 2FA
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!hasPassword && (
        <p className="text-[13px] text-[var(--text-muted)]">
          Set a password first (Profile → Security → Change password), then you can enable 2FA.
        </p>
      )}
      {!setup ? (
        <div className="flex flex-wrap items-center gap-2">
          {hasPassword && (
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Current password"
              autoComplete="current-password"
              className="w-44"
            />
          )}
          <Button size="sm" loading={pending} disabled={!hasPassword} onClick={beginSetup}>
            Enable 2FA
          </Button>
        </div>
      ) : (
        <>
          <p className="text-[14px] text-[var(--text-muted)]">
            Scan this with an authenticator app (Google Authenticator, Authy, 1Password, etc.), then enter the 6-digit code it shows.
          </p>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={setup.qrDataUrl} alt="Scan with your authenticator app" width={140} height={140} className="rounded-[var(--radius-md)] border border-[var(--border)]" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold uppercase text-[var(--text-subtle)]">Can&apos;t scan? Enter manually</p>
              <p className="mt-1 break-all font-mono text-[13px] text-[var(--text)]">{setup.secret}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="123456"
              maxLength={6}
              inputMode="numeric"
              autoComplete="one-time-code"
              className="w-32"
            />
            <Button
              size="sm"
              loading={pending}
              onClick={async () => {
                setPending(true);
                const res = await confirmTwoFactorSetupAction(code);
                setPending(false);
                if (res.ok) {
                  setOn(true);
                  setSetup(null);
                  setCode("");
                }
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
