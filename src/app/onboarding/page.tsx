import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireUser, getWorkspaceContext } from "@/lib/session";
import { OnboardingWizard } from "./wizard";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const user = await requireUser();
  // Only bounce to the app when a usable workspace actually resolves. Checking
  // "any membership row" here caused an infinite /onboarding <-> /dashboard
  // loop for users whose membership had no active workspace.
  const ctx = await getWorkspaceContext();
  if (ctx?.active) redirect("/dashboard");

  return (
    <div className="min-h-screen bg-[var(--bg)] px-4 py-10">
      <OnboardingWizard name={user.name} />
    </div>
  );
}
