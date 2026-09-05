"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { withPermission, ensureInWorkspace, entitlementGuard, featureGuard, ok, fail } from "./_helpers";

const WIDGETS = [
  "followers_growth",
  "reach_impressions",
  "engagement_rate",
  "top_posts",
  "worst_posts",
  "engagement_by_format",
  "platform_comparison",
  "campaign_performance",
  "posting_frequency",
];

export async function createReportAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("reports.manage");
  const name = String(formData.get("name") ?? "").trim();
  const dateRange = String(formData.get("dateRange") || "last_30_days");
  const widgets = formData.getAll("widgets").map(String).filter((w) => WIDGETS.includes(w));
  const branded = formData.get("branded") === "on";
  if (!name) return fail("Name your report");
  if (widgets.length === 0) return fail("Pick at least one widget");

  // White-label is an Agency-tier entitlement and a platform-flagged feature.
  // Enforced here because the client just posts `branded=on` — a checkbox in
  // the browser is not a plan check.
  if (branded) {
    const offFlag = await featureGuard("white_label_reports", "White-label reports");
    if (offFlag) return offFlag;
    const notEntitled = await entitlementGuard(ctx.active.org.id, "white_label", "White-label reports");
    if (notEntitled) return notEntitled;
  }

  const r = await db.report.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      name,
      config: JSON.stringify({ dateRange, widgets, branding: { logo: branded } }),
      schedule: "none",
    },
  });
  revalidatePath("/reports");
  return ok(r.id, "Report created");
}

export async function updateReportScheduleAction(id: string, schedule: "none" | "weekly" | "monthly") {
  const ctx = await withPermission("reports.manage");
  // Scheduled delivery is a paid plan feature; turning it off is always allowed.
  if (schedule !== "none") {
    const notEntitled = await entitlementGuard(ctx.active.org.id, "scheduled_reports", "Scheduled reports");
    if (notEntitled) return notEntitled;
  }
  await ensureInWorkspace("report", id, ctx.active.workspace.id);
  await db.report.update({ where: { id }, data: { schedule } });
  revalidatePath("/reports");
  return ok(undefined, schedule === "none" ? "Schedule cleared" : `Scheduled ${schedule}`);
}

export async function toggleReportShareAction(id: string) {
  const ctx = await withPermission("reports.manage");
  await ensureInWorkspace("report", id, ctx.active.workspace.id);
  const r = await db.report.findUniqueOrThrow({ where: { id } });
  await db.report.update({
    where: { id },
    data: { shareToken: r.shareToken ? null : `rpt_${randomBytes(10).toString("hex")}` },
  });
  revalidatePath("/reports");
  return ok(undefined, r.shareToken ? "Sharing disabled" : "Share link created");
}

export async function runReportAction(id: string) {
  const ctx = await withPermission("reports.manage");
  await ensureInWorkspace("report", id, ctx.active.workspace.id);
  await db.report.update({ where: { id }, data: { lastRunAt: new Date() } });
  revalidatePath("/reports");
  return ok(undefined, "Report refreshed — open it or export the CSV");
}

export async function deleteReportAction(id: string) {
  const ctx = await withPermission("reports.manage");
  await ensureInWorkspace("report", id, ctx.active.workspace.id);
  await db.report.delete({ where: { id } });
  revalidatePath("/reports");
  return ok(undefined, "Report deleted");
}
