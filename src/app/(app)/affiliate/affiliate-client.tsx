"use client";

import * as React from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { applyForAffiliateAction } from "@/app/actions/affiliates";

export function ApplyButton() {
  const [pending, start] = useTransition();
  const router = useRouter();
  const { toast } = useToast();
  return (
    <Button
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await applyForAffiliateAction();
          toast({ title: res.message ?? res.error ?? "", tone: res.ok ? "success" : "error" });
          if (res.ok) router.refresh();
        })
      }
    >
      Apply now
    </Button>
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
