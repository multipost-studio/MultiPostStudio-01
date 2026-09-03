import type { Metadata } from "next";
import { SignUpForm } from "../_forms";
import { isGoogleEnabled } from "@/auth";

export const metadata: Metadata = { title: "Create account" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const { ref } = await searchParams;
  return <SignUpForm googleEnabled={isGoogleEnabled} referralCode={ref ?? ""} />;
}
