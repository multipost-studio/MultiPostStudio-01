import type { Metadata } from "next";
import { LoginForm } from "../_forms";
import { isGoogleEnabled } from "@/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Admin-controlled: /admin/flags -> "demo_login".
  const demoLogin = await isFeatureEnabled("demo_login");
  return <LoginForm next={next ?? "/dashboard"} googleEnabled={isGoogleEnabled} demoLogin={demoLogin} />;
}
