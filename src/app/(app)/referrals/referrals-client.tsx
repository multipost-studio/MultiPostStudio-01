"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";

export function ReferralShare({ link, code }: { link: string; code: string }) {
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

  const share = (url: string) => window.open(url, "_blank", "noopener,noreferrer");
  const text = encodeURIComponent("I'm using MultiPost Studio to run my social media — join with my link and we both get bonus AI credits:");
  const enc = encodeURIComponent(link);

  return (
    <div className="mt-1.5 space-y-2">
      <div className="flex gap-2">
        <Input readOnly value={link} className="font-mono text-[13px]" onFocus={(e) => e.currentTarget.select()} />
        <Button size="sm" onClick={copy}>{copied ? "Copied ✓" : "Copy"}</Button>
      </div>
      <p className="text-[12px] text-[var(--text-subtle)]">
        Code: <span className="font-mono text-[var(--text)]">{code}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" onClick={() => share(`https://twitter.com/intent/tweet?text=${text}&url=${enc}`)}>
          Share on X
        </Button>
        <Button size="sm" variant="ghost" onClick={() => share(`https://www.linkedin.com/sharing/share-offsite/?url=${enc}`)}>
          LinkedIn
        </Button>
        <Button size="sm" variant="ghost" onClick={() => share(`mailto:?subject=${encodeURIComponent("Try MultiPost Studio")}&body=${text}%20${enc}`)}>
          Email
        </Button>
      </div>
    </div>
  );
}
