import * as React from "react";

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-[13.5px] font-medium text-[var(--text)] ${className ?? ""}`}>
      {label}
      <div className="mt-1.5 font-normal">{children}</div>
      {hint && <span className="mt-1 block text-[12px] font-normal text-[var(--text-subtle)]">{hint}</span>}
    </label>
  );
}

export function Panel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--border)]/70 bg-[var(--surface)] p-5 shadow-[var(--shadow-card)]">
      <h2 className="text-[17px] font-semibold text-[var(--text)]">{title}</h2>
      {description && <p className="mt-1 max-w-2xl text-[13.5px] text-[var(--text-muted)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
