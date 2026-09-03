import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

/**
 * Full-viewport branded scaffold for error / status routes (404, 403, 500,
 * 503, maintenance, offline). Centered, responsive, keeps MultiPost Studio
 * identity. Actions are passed as ready-made nodes so each page controls its
 * own CTAs (a Link, a client Retry button, etc).
 */
export function SystemPage({
  code,
  icon,
  title,
  description,
  actions,
  footer,
}: {
  /** Short status label shown above the title, e.g. "404" or "Offline". */
  code?: string;
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="grid min-h-screen place-items-center bg-[var(--bg)] px-6 py-16">
      <div className="w-full max-w-md text-center">
        <Link href="/" aria-label="MultiPost Studio home" className="inline-block">
          <Logo />
        </Link>

        <div className="mt-10">
          {icon && (
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)]">
              {icon}
            </div>
          )}
          {code && (
            <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-[var(--text-subtle)]">
              {code}
            </p>
          )}
          <h1 className="mt-2 text-[26px] font-bold leading-tight text-[var(--text)] sm:text-[30px]">
            {title}
          </h1>
          <div className="mx-auto mt-3 max-w-sm text-[15px] leading-relaxed text-[var(--text-muted)]">
            {description}
          </div>
        </div>

        {actions && (
          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            {actions}
          </div>
        )}

        {footer && <div className="mt-8 text-[13px] text-[var(--text-subtle)]">{footer}</div>}
      </div>
    </main>
  );
}

/** Convenience: primary + secondary link CTAs, the common case. */
export function SystemActions({
  primary,
  secondary,
}: {
  primary?: { href: string; label: string };
  secondary?: { href: string; label: string };
}) {
  return (
    <>
      {primary && (
        <Button asChild size="md" className="w-full sm:w-auto">
          <Link href={primary.href}>{primary.label}</Link>
        </Button>
      )}
      {secondary && (
        <Button asChild size="md" variant="outline" className="w-full sm:w-auto">
          <Link href={secondary.href}>{secondary.label}</Link>
        </Button>
      )}
    </>
  );
}
