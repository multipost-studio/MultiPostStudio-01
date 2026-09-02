"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { resendVerificationAction } from "@/app/actions/auth";

export function EmailVerifyNotice({ verified }: { verified: boolean }) {
  const { toast } = useToast();
  const [token, setToken] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  if (verified) {
    return (
      <p className="flex items-center gap-2 text-[14px] text-[var(--success)]">
        <CheckCircle2 size={16} /> Your email is verified.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-[14px] text-[var(--text-muted)]">Your email isn&apos;t verified yet.</p>
      <Button
        size="sm"
        loading={pending}
        onClick={async () => {
          setPending(true);
          const res = await resendVerificationAction();
          setPending(false);
          if (res.ok && res.token) setToken(res.token);
          toast({ title: res.message ?? "Sent", tone: res.ok ? "success" : "error" });
        }}
      >
        Send verification link
      </Button>
      {token && (
        <Link href={`/verify?token=${token}`} className="block text-[14px] text-[var(--primary)] hover:underline">
          Verify now →
        </Link>
      )}
    </div>
  );
}
