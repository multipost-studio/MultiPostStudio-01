import type { Metadata } from "next";
import Link from "next/link";
import { ResetForm } from "../_forms";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  if (!token) {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Missing reset token</h1>
        <p className="text-[14px] text-[var(--text-muted)]">Request a new link to continue.</p>
        <Link href="/forgot" className="text-[14px] text-[var(--primary)] hover:underline">
          Request reset link →
        </Link>
      </div>
    );
  }
  return <ResetForm token={token} />;
}
