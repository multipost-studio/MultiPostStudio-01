"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { writeSettings, type SiteSettings } from "@/lib/settings";
import { invalidatePlans } from "@/lib/plans";
import { invalidateFeatureFlags } from "@/lib/feature-flags";
import { invalidateCms } from "@/lib/cms";
import { applyPlan } from "@/lib/adapters/billing";
import { PLAN_KEYS, type PlanKey } from "@/lib/constants";

/* ---------------- Feature flags ---------------- */

export async function toggleFeatureFlagAction(id: string, enabled: boolean) {
  await requirePlatformAdmin();
  await db.featureFlag.update({ where: { id }, data: { enabled } });
  invalidateFeatureFlags();
  revalidatePath("/admin/flags");
  return { ok: true };
}

export async function setFlagRolloutAction(id: string, rollout: number) {
  await requirePlatformAdmin();
  await db.featureFlag.update({ where: { id }, data: { rollout: Math.max(0, Math.min(100, rollout)) } });
  invalidateFeatureFlags();
  revalidatePath("/admin/flags");
  return { ok: true };
}

/* ---------------- Plans (synced app-wide via src/lib/plans.ts) ---------------- */

export type PlanPatch = Partial<{
  name: string;
  priceMonthly: number;
  priceAnnual: number;
  maxChannels: number;
  maxUsers: number;
  maxScheduled: number;
  aiCredits: number;
  storageMb: number;
  features: string[];
}>;

export async function updatePlanAction(id: string, data: PlanPatch) {
  const admin = await requirePlatformAdmin();
  const clean: Record<string, unknown> = {};
  const nums: (keyof PlanPatch)[] = [
    "priceMonthly",
    "priceAnnual",
    "maxChannels",
    "maxUsers",
    "maxScheduled",
    "aiCredits",
    "storageMb",
  ];
  for (const k of nums) {
    if (data[k] !== undefined) clean[k] = Math.max(0, Math.round(Number(data[k])));
  }
  if (typeof data.name === "string" && data.name.trim()) clean.name = data.name.trim().slice(0, 60);
  if (Array.isArray(data.features)) {
    clean.features = JSON.stringify(data.features.map((f) => String(f).trim()).filter(Boolean).slice(0, 20));
  }
  await db.plan.update({ where: { id }, data: clean });
  invalidatePlans();
  await logAudit({ actorId: admin.id, action: "admin.plan_updated", targetType: "plan", targetId: id, metadata: clean });
  revalidatePath("/admin/plans");
  revalidatePath("/pricing");
  return { ok: true, message: "Plan updated — live everywhere" };
}

/* ---------------- Site settings ---------------- */

export async function updateSiteSettingsAction(patch: Partial<SiteSettings>) {
  const admin = await requirePlatformAdmin();
  await writeSettings(patch, admin.id);
  await logAudit({ actorId: admin.id, action: "admin.settings_updated", targetType: "system", targetId: "settings", metadata: patch });
  revalidatePath("/admin/settings", "layout");
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved" };
}

/* ---------------- Users ---------------- */

export async function setUserAdminAction(userId: string, isAdmin: boolean) {
  const admin = await requirePlatformAdmin();
  if (userId === admin.id) return { ok: false, error: "You can't change your own admin status" };
  await db.user.update({ where: { id: userId }, data: { isPlatformAdmin: isAdmin } });
  await logAudit({ actorId: admin.id, action: "admin.user_admin_changed", targetType: "user", targetId: userId, metadata: { isAdmin } });
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function setUserSuspendedAction(userId: string, suspended: boolean) {
  const admin = await requirePlatformAdmin();
  if (userId === admin.id) return { ok: false, error: "You can't suspend yourself" };
  await db.user.update({ where: { id: userId }, data: { suspendedAt: suspended ? new Date() : null } });
  if (suspended) await db.session.deleteMany({ where: { userId } }); // kick active sessions
  await logAudit({ actorId: admin.id, action: suspended ? "admin.user_suspended" : "admin.user_restored", targetType: "user", targetId: userId });
  revalidatePath("/admin/users");
  return { ok: true, message: suspended ? "User suspended" : "User restored" };
}

export async function forceVerifyUserAction(userId: string) {
  const admin = await requirePlatformAdmin();
  await db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  await logAudit({ actorId: admin.id, action: "admin.user_verified", targetType: "user", targetId: userId });
  revalidatePath("/admin/users");
  return { ok: true, message: "Email marked verified" };
}

export async function deleteUserAction(userId: string) {
  const admin = await requirePlatformAdmin();
  if (userId === admin.id) return { ok: false, error: "You can't delete yourself" };
  // Soft delete: block sign-in, drop sessions. Content is retained.
  await db.user.update({ where: { id: userId }, data: { deletedAt: new Date(), suspendedAt: new Date() } });
  await db.session.deleteMany({ where: { userId } });
  await logAudit({ actorId: admin.id, action: "admin.user_deleted", targetType: "user", targetId: userId });
  revalidatePath("/admin/users");
  return { ok: true, message: "User deleted (soft)" };
}

/* ---------------- Support ---------------- */

export async function updateTicketStatusAction(id: string, status: "open" | "pending" | "resolved" | "closed") {
  await requirePlatformAdmin();
  await db.supportTicket.update({ where: { id }, data: { status } });
  revalidatePath("/admin/support");
  return { ok: true };
}

/* ---------------- Organizations ---------------- */

export async function setOrgSuspendedAction(orgId: string, suspended: boolean) {
  const admin = await requirePlatformAdmin();
  await db.membership.updateMany({ where: { orgId }, data: { status: suspended ? "suspended" : "active" } });
  await logAudit({ orgId, actorId: admin.id, action: suspended ? "admin.org_suspended" : "admin.org_restored", targetType: "organization", targetId: orgId });
  revalidatePath("/admin/orgs");
  return { ok: true };
}

export async function adminSetOrgPlanAction(orgId: string, planKey: string, interval: "month" | "year") {
  const admin = await requirePlatformAdmin();
  if (!PLAN_KEYS.includes(planKey as PlanKey)) return { ok: false, error: "Unknown plan" };
  await applyPlan(orgId, planKey as PlanKey, interval, admin.id, undefined, "stub");
  await logAudit({ orgId, actorId: admin.id, action: "admin.org_plan_set", targetType: "organization", targetId: orgId, metadata: { planKey, interval } });
  revalidatePath("/admin/orgs");
  return { ok: true, message: `Plan set to ${planKey}` };
}

export async function deleteOrgAction(orgId: string) {
  const admin = await requirePlatformAdmin();
  await db.organization.update({ where: { id: orgId }, data: { deletedAt: new Date() } });
  await db.membership.updateMany({ where: { orgId }, data: { status: "suspended" } });
  await logAudit({ orgId, actorId: admin.id, action: "admin.org_deleted", targetType: "organization", targetId: orgId });
  revalidatePath("/admin/orgs");
  return { ok: true, message: "Organization deleted (soft)" };
}

/* ---------------- CMS ---------------- */

export async function upsertCmsEntryAction(input: {
  id?: string;
  collection: string;
  slug: string;
  data: string; // JSON string
  published: boolean;
  sortIndex: number;
}) {
  const admin = await requirePlatformAdmin();
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug) return { ok: false, error: "Slug required" };
  try {
    JSON.parse(input.data);
  } catch {
    return { ok: false, error: "Data is not valid JSON" };
  }
  await db.cmsEntry.upsert({
    where: input.id ? { id: input.id } : { collection_slug: { collection: input.collection, slug } },
    create: {
      collection: input.collection,
      slug,
      data: input.data,
      published: input.published,
      sortIndex: Math.round(input.sortIndex) || 0,
      updatedBy: admin.id,
    },
    update: {
      slug,
      data: input.data,
      published: input.published,
      sortIndex: Math.round(input.sortIndex) || 0,
      updatedBy: admin.id,
    },
  });
  invalidateCms(input.collection);
  await logAudit({ actorId: admin.id, action: "admin.cms_upsert", targetType: "cms", targetId: `${input.collection}/${slug}` });
  revalidatePath("/admin/content");
  revalidatePath("/", "layout");
  return { ok: true, message: "Saved" };
}

export async function deleteCmsEntryAction(id: string) {
  const admin = await requirePlatformAdmin();
  const row = await db.cmsEntry.findUnique({ where: { id } });
  await db.cmsEntry.delete({ where: { id } });
  if (row) invalidateCms(row.collection);
  await logAudit({ actorId: admin.id, action: "admin.cms_delete", targetType: "cms", targetId: id });
  revalidatePath("/admin/content");
  return { ok: true, message: "Deleted" };
}

/* ---------------- Bulk import (users) ---------------- */

export async function importUsersAction(csvText: string) {
  const admin = await requirePlatformAdmin();
  const bcrypt = (await import("bcryptjs")).default;
  const { randomBytes } = await import("node:crypto");

  const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // optional header
  if (lines[0] && /email/i.test(lines[0]) && /name/i.test(lines[0])) lines.shift();

  let created = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of lines.slice(0, 5000)) {
    const [emailRaw, ...rest] = line.split(",");
    const email = (emailRaw ?? "").trim().toLowerCase();
    const name = (rest.join(",").trim() || email.split("@")[0]).slice(0, 80);
    if (!email.includes("@")) {
      errors.push(`bad email: ${line.slice(0, 40)}`);
      continue;
    }
    if (await db.user.findUnique({ where: { email } })) {
      skipped++;
      continue;
    }
    try {
      await db.user.create({
        data: {
          email,
          name,
          // random password — the user must use "forgot password" to set one
          passwordHash: await bcrypt.hash(randomBytes(24).toString("hex"), 10),
          notificationPref: { create: {} },
        },
      });
      created++;
    } catch (e) {
      errors.push(`${email}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  await logAudit({ actorId: admin.id, action: "admin.users_imported", targetType: "user", targetId: "bulk", metadata: { created, skipped } });
  revalidatePath("/admin/users");
  return {
    ok: true,
    message: `Imported ${created}, skipped ${skipped} existing${errors.length ? `, ${errors.length} errors` : ""}.`,
    errors: errors.slice(0, 10),
  };
}
