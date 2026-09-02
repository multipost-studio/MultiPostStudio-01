"use client";

import * as React from "react";
import { Textarea } from "@/components/ui/input";
import { PLATFORMS } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function CharCounter() {
  const [text, setText] = React.useState("");
  const len = text.length;

  return (
    <div className="space-y-4">
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[140px]" placeholder="Paste or type your caption…" />
      <p className="text-[14px] text-[var(--text-muted)]">
        <span className="font-semibold text-[var(--text)]">{len.toLocaleString()}</span> characters ·{" "}
        {text.trim() ? text.trim().split(/\s+/).length : 0} words
      </p>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {Object.values(PLATFORMS).map((p) => {
          const over = len > p.limit;
          const pct = Math.min(100, (len / p.limit) * 100);
          return (
            <div key={p.label} className="rounded-[var(--radius-md)] border border-[var(--border)] p-2.5">
              <div className="flex items-center justify-between text-[13px]">
                <span className="text-[var(--text-muted)]">{p.label}</span>
                <span className={cn("tabular-nums", over ? "font-medium text-[var(--danger)]" : "text-[var(--text)]")}>
                  {len}/{p.limit.toLocaleString()}
                </span>
              </div>
              <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--bg-sunken)]">
                <div className={cn("h-full rounded-full", over ? "bg-[var(--danger)]" : "bg-[var(--primary)]")} style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
