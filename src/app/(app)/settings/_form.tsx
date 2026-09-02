"use client";

import * as React from "react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";

type Result = { ok: boolean; error?: string; message?: string };

export function ActionForm({
  action,
  children,
  submitLabel = "Save changes",
}: {
  action: (prev: Result, fd: FormData) => Promise<Result>;
  children: React.ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false } as Result);
  return (
    <form action={formAction} className="space-y-4">
      {children}
      {state.error && (
        <p className="rounded-[var(--radius-md)] border border-[var(--danger)] bg-[var(--danger-soft)] px-3 py-2 text-[14px] text-[var(--danger)]">
          {state.error}
        </p>
      )}
      {state.message && (
        <p className="rounded-[var(--radius-md)] border border-[var(--success)] bg-[var(--success-soft)] px-3 py-2 text-[14px] text-[var(--success)]">
          {state.message}
        </p>
      )}
      <Button type="submit" size="sm" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-semibold text-[var(--text)]">{title}</h2>
      {description && <p className="mt-0.5 text-[14px] text-[var(--text-muted)]">{description}</p>}
      <div className="mt-4 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5">{children}</div>
    </section>
  );
}
