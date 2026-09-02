import type { Metadata } from "next";
import { SignUpForm } from "../_forms";
import { isGoogleEnabled } from "@/auth";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return <SignUpForm googleEnabled={isGoogleEnabled} />;
}
