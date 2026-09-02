import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[var(--bg)] px-4 text-center">
      <Logo />
      <p className="text-5xl font-semibold text-[var(--text)]">404</p>
      <p className="text-[15px] text-[var(--text-muted)]">This page doesn&apos;t exist or moved.</p>
      <Button asChild size="sm">
        <Link href="/dashboard">Back to dashboard</Link>
      </Button>
    </div>
  );
}
