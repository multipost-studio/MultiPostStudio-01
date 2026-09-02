"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { updateNotificationPrefsAction } from "@/app/actions/notifications";

const ROWS: { key: string; label: string; hint: string }[] = [
  { key: "emailPublish", label: "Publishing results", hint: "Email me when a post publishes or fails" },
  { key: "emailApproval", label: "Approval requests", hint: "Email me when something needs my review" },
  { key: "emailMentions", label: "Mentions & comments", hint: "Email me when I'm @mentioned" },
  { key: "emailWeeklyDigest", label: "Weekly analytics digest", hint: "A performance summary every Monday" },
  { key: "inappAll", label: "In-app notifications", hint: "Show the notification bell activity" },
];

export function NotificationPrefsForm({ prefs }: { prefs: Record<string, boolean> }) {
  const [state, action, pending] = useActionState(updateNotificationPrefsAction, { ok: false } as { ok: boolean; message?: string });
  return (
    <form action={action} className="space-y-1">
      {ROWS.map((r) => (
        <label key={r.key} className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-3 last:border-0">
          <span>
            <span className="block text-[14px] font-medium text-[var(--text)]">{r.label}</span>
            <span className="block text-[13px] text-[var(--text-subtle)]">{r.hint}</span>
          </span>
          <input
            type="checkbox"
            name={r.key}
            defaultChecked={prefs[r.key]}
            className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
          />
        </label>
      ))}
      {state.message && <p className="pt-2 text-[14px] text-[var(--success)]">{state.message}</p>}
      <div className="pt-3">
        <Button type="submit" size="sm" loading={pending}>
          Save preferences
        </Button>
      </div>
    </form>
  );
}
