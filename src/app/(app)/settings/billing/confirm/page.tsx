import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PLAN_KEYS, type PlanKey } from "@/lib/constants";
import { confirmPlanChangeAction } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Confirm plan" };

// Landing page for the stubbed checkout redirect. Applies the plan then bounces back.
export default async function ConfirmPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; interval?: string }>;
}) {
  const { plan, interval } = await searchParams;
  const planKey = (plan ?? "") as PlanKey;
  const iv = interval === "year" ? "year" : "month";

  if (!PLAN_KEYS.includes(planKey)) redirect("/settings/billing");

  async function confirm() {
    "use server";
    await confirmPlanChangeAction(planKey, iv);
  }

  return (
    <div className="max-w-md">
      <h1 className="text-[19px] font-semibold text-[var(--text)]">Confirm your plan change</h1>
      <p className="mt-1 text-[14px] text-[var(--text-muted)]">
        You&apos;re switching to <span className="font-medium capitalize text-[var(--text)]">{planKey}</span>, billed {iv === "year" ? "annually" : "monthly"}.
      </p>
      <form action={confirm} className="mt-4">
        <Button type="submit">Confirm and apply</Button>
      </form>
    </div>
  );
}
