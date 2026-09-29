"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { applyForAffiliateAction } from "@/app/actions/affiliates";

export function ApplyButton() {
  const [pending, start] = useTransition();
  const [accepted, setAccepted] = React.useState(false);
  const router = useRouter();
  const { toast } = useToast();
  return (
    <div className="space-y-3">
      <label className="flex items-start gap-2 text-[13px] text-[var(--text-muted)]">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/affiliate-terms" target="_blank" className="text-[var(--primary)] hover:underline">
            Affiliate Program Terms
          </Link>
          , including the disclosure requirement.
        </span>
      </label>
      <Button
        loading={pending}
        disabled={!accepted}
        onClick={() =>
          start(async () => {
            const res = await applyForAffiliateAction(accepted);
            toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
            if (res.ok) router.refresh();
          })
        }
      >
        Apply now
      </Button>
    </div>
  );
}

export function AffiliateShare({ link, code }: { link: string; code: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast({ title: "Couldn't copy — select and copy manually", tone: "error" });
    }
  }

  return (
    <div className="mt-1.5 space-y-2">
      <div className="flex gap-2">
        <Input readOnly value={link} className="font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Button>
      </div>
      <p className="text-[12px] text-[var(--text-subtle)]">
        Code: <span className="font-mono text-[var(--text)]">{code}</span>
      </p>
    </div>
  );
}
