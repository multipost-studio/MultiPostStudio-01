"use client";

import * as React from "react";
import { Input, Field } from "@/components/ui/input";

export function EngagementRateTool() {
  const [likes, setLikes] = React.useState(0);
  const [comments, setComments] = React.useState(0);
  const [shares, setShares] = React.useState(0);
  const [saves, setSaves] = React.useState(0);
  const [base, setBase] = React.useState(0);

  const interactions = likes + comments + shares + saves;
  const rate = base > 0 ? (interactions / base) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(
          [
            ["Likes", likes, setLikes],
            ["Comments", comments, setComments],
            ["Shares", shares, setShares],
            ["Saves", saves, setSaves],
          ] as const
        ).map(([label, val, set]) => (
          <Field key={label} label={label}>
            <Input type="number" min={0} value={val} onChange={(e) => set(Number(e.target.value) || 0)} />
          </Field>
        ))}
      </div>
      <Field label="Reach or follower count">
        <Input type="number" min={0} value={base} onChange={(e) => setBase(Number(e.target.value) || 0)} />
      </Field>
      <div className="rounded-[var(--radius-md)] bg-[var(--primary-soft)]/40 p-4 text-center">
        <p className="text-[13px] uppercase tracking-wide text-[var(--text-subtle)]">Engagement rate</p>
        <p className="text-3xl font-semibold text-[var(--primary)]">{rate.toFixed(2)}%</p>
        <p className="mt-1 text-[13px] text-[var(--text-muted)]">
          {interactions.toLocaleString()} interactions ÷ {base.toLocaleString()} base
        </p>
      </div>
      <p className="text-[13px] text-[var(--text-subtle)]">
        Rule of thumb: 1–3% is solid on most platforms; over 6% is strong. Rates fall as an account grows.
      </p>
    </div>
  );
}
