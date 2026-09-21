import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/session";
import { runSystemHealthProbes } from "@/lib/health-check";
import { HealthDashboardClient } from "./health-client";

export const metadata: Metadata = { title: "Admin · System Health & Readiness Probes" };

export default async function AdminHealthPage() {
  await requirePlatformAdmin();
  const initialReport = await runSystemHealthProbes();

  return (
    <HealthDashboardClient initialReport={initialReport} />
  );
}
