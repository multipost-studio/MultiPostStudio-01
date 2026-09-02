import type { Metadata } from "next";
import Link from "next/link";
import { verifyEmailAction } from "@/app/actions/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const result = token ? await verifyEmailAction(token) : { ok: false, error: "No token provided" };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">{result.ok ? "Email verified" : "Verification failed"}</h1>
      <p className="text-[14px] text-[var(--text-muted)]">
        {result.ok ? "Your email address is confirmed. You're all set." : result.error}
      </p>
      <Button asChild>
        <Link href="/dashboard">Go to dashboard</Link>
      </Button>
    </div>
  );
}
