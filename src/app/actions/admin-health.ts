"use server";

import { requirePlatformAdmin } from "@/lib/session";
import { runSystemHealthProbes, type SystemHealthReport } from "@/lib/health-check";
import { ok, fail, type ActionResult } from "./_helpers";

export async function triggerHealthProbesAction() {
  try {
    await requirePlatformAdmin();
    const report = await runSystemHealthProbes();
    return ok(report);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "Failed to run health probes");
  }
}
