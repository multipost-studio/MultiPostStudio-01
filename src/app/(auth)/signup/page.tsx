import type { Metadata } from "next";
import { SignUpForm } from "../_forms";
import { isGoogleEnabled } from "@/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ aff?: string; email?: string }>;
}) {
  const { aff, email } = await searchParams;
  return (
    <SignUpForm
      googleEnabled={isGoogleEnabled}
      affiliateCode={aff ?? ""}
      initialEmail={email ?? ""}
    />
  );
}
