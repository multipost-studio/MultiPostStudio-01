import Link from "next/link";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shown in place of a page whose feature isn't in the org's plan.
 *
 * Server component on purpose: the check that renders this must happen on the
 * server (see the pages that use it). Hiding a page in the client while the
 * data still loads underneath is not a plan gate.
 */
export function UpgradeRequired({
  feature,
  description,
}: {
  feature: string;
  description?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-[var(--border-strong)] bg-[var(--surface)] px-6 py-16 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary-soft)] text-[var(--primary)]">
        <Lock size={18} />
      </div>
      <p className="text-[16px] font-semibold text-[var(--text)]">{feature} isn&apos;t in your plan</p>
      <p className="mt-1 max-w-sm text-[14px] text-[var(--text-muted)]">
        {description ?? "Upgrade to unlock this — your existing data stays exactly as it is."}
      </p>
      <Button size="sm" className="mt-4" asChild>
        <Link href="/settings/billing">See plans</Link>
      </Button>
    </div>
  );
}
