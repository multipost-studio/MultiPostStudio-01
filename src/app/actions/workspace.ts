"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, getWorkspaceContext, requireWorkspace, WS_COOKIE } from "@/lib/session";
import { isProduction } from "@/lib/env";
import { hasEntitlement } from "@/lib/entitlements";
import { assertPermission } from "@/lib/rbac";
import { logActivity, logAudit } from "@/lib/events";
import { slugify, parseJson } from "@/lib/utils";
import { brandBrainDigest } from "@/lib/adapters/ai";

export async function switchWorkspaceAction(workspaceId: string) {
  const ctx = await getWorkspaceContext();
  const target = ctx?.workspaces.find((w) => w.workspace.id === workspaceId);
  if (!target) return;
  const jar = await cookies();
  jar.set(WS_COOKIE, workspaceId, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: isProduction });
  redirect("/dashboard");
}

const createWorkspaceSchema = z.object({
  name: z.string().min(2).max(60),
  kind: z.enum(["brand", "client"]),
  clientName: z.string().max(80).optional(),
  industry: z.string().max(80).optional(),
});

export async function createWorkspaceAction(_prev: unknown, formData: FormData) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, "workspace.create");

  const parsed = createWorkspaceSchema.safeParse({
    name: formData.get("name"),
    kind: formData.get("kind") ?? "brand",
    clientName: formData.get("clientName") || undefined,
    industry: formData.get("industry") || undefined,
  });
  if (!parsed.success) return { ok: false, error: "Check the workspace details" };

  // Client workspaces are the Agency-tier "client accounts" feature. The
  // /agency page gates on org.type === "agency", but org type is chosen by the
  // user at signup — it's not proof of plan. The entitlement is.
  if (parsed.data.kind === "client" && !(await hasEntitlement(ctx.active.org.id, "client_accounts"))) {
    return { ok: false, error: "Client workspaces aren't included in your current plan." };
  }

  const orgId = ctx.active.org.id;
  let slug = slugify(parsed.data.name);
  const clash = await db.workspace.findFirst({ where: { orgId, slug } });
  if (clash) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

  const ws = await db.workspace.create({
    data: {
      orgId,
      name: parsed.data.name,
      slug,
      kind: parsed.data.kind,
      clientName: parsed.data.clientName,
      industry: parsed.data.industry,
      members: { create: { userId: ctx.user.id, role: "manager" } },
    },
  });

  await logActivity({
    workspaceId: ws.id,
    actorId: ctx.user.id,
    verb: "created",
    entityType: "workspace",
    entityId: ws.id,
    summary: `Created workspace "${ws.name}"`,
  });
  await logAudit({ orgId, actorId: ctx.user.id, action: "workspace.created", targetType: "workspace", targetId: ws.id });

  const jar = await cookies();
  jar.set(WS_COOKIE, ws.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: isProduction });
  redirect("/dashboard");
}

const brandSchema = z.object({
  name: z.string().min(2).max(60),
  industry: z.string().max(80).optional(),
  brandVoice: z.string().max(2000).optional(),
  websiteUrl: z.string().url().optional().or(z.literal("")),
  brandColors: z.string().optional(), // comma-separated hex
});

export async function updateWorkspaceAction(_prev: unknown, formData: FormData) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, "workspace.manage");

  const parsed = brandSchema.safeParse({
    name: formData.get("name"),
    industry: formData.get("industry") || undefined,
    brandVoice: formData.get("brandVoice") || undefined,
    websiteUrl: formData.get("websiteUrl") || "",
    brandColors: formData.get("brandColors") || undefined,
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };

  const colors = parsed.data.brandColors
    ? parsed.data.brandColors.split(",").map((c) => c.trim()).filter((c) => /^#?[0-9a-f]{3,8}$/i.test(c))
    : undefined;

  await db.workspace.update({
    where: { id: ctx.active.workspace.id },
    data: {
      name: parsed.data.name,
      industry: parsed.data.industry ?? null,
      brandVoice: parsed.data.brandVoice ?? null,
      websiteUrl: parsed.data.websiteUrl || null,
      ...(colors ? { brandColors: JSON.stringify(colors) } : {}),
    },
  });
  revalidatePath("/settings/workspace");
  return { ok: true, message: "Workspace updated" };
}

export async function addBrandSourceAction(_prev: unknown, formData: FormData) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, "workspace.manage");
  const kind = String(formData.get("kind") ?? "document");
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) return { ok: false, error: "Title and content are required" };

  await db.brandSource.create({
    data: { workspaceId: ctx.active.workspace.id, kind, title, content, status: "ready" },
  });

  const sources = await db.brandSource.findMany({ where: { workspaceId: ctx.active.workspace.id } });
  await db.workspace.update({
    where: { id: ctx.active.workspace.id },
    data: { brandBrain: brandBrainDigest(sources.map((s) => ({ kind: s.kind, title: s.title, content: s.content }))) },
  });
  revalidatePath("/settings/brand");
  return { ok: true, message: "Source added to Brand Brain" };
}

export async function deleteBrandSourceAction(id: string) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, "workspace.manage");
  await db.brandSource.deleteMany({ where: { id, workspaceId: ctx.active.workspace.id } });
  revalidatePath("/settings/brand");
}

/** Replace a channel's weekly posting slots. */
export async function updateQueueSlotsAction(
  channelId: string,
  slots: { weekday: number; hour: number; minute: number }[],
) {
  const ctx = await requireWorkspace();
  assertPermission(ctx.active.role, "content.publish");
  const channel = await db.socialChannel.findUnique({ where: { id: channelId } });
  if (!channel || channel.workspaceId !== ctx.active.workspace.id) {
    return { ok: false, error: "Channel not found" };
  }
  const clean = slots
    .filter((s) => s.weekday >= 0 && s.weekday <= 6 && s.hour >= 0 && s.hour <= 23)
    .slice(0, 100);
  await db.$transaction([
    db.queueSlot.deleteMany({ where: { channelId } }),
    db.queueSlot.createMany({
      data: clean.map((s) => ({
        workspaceId: ctx.active.workspace.id,
        channelId,
        weekday: s.weekday,
        hour: s.hour,
        minute: s.minute ?? 0,
      })),
    }),
  ]);
  revalidatePath("/settings/workspace");
  revalidatePath("/queue");
  return { ok: true, message: "Posting schedule updated" };
}

/** Onboarding: create org + first workspace + free subscription in one shot. */
const onboardingSchema = z.object({
  role: z.enum(["creator", "business", "agency", "marketing_team", "enterprise"]),
  orgName: z.string().min(2).max(80),
  industry: z.string().max(80),
  teamSize: z.string().max(20),
  platforms: z.string(), // JSON array
  goals: z.string(), // JSON array
});

export async function completeOnboardingAction(_prev: unknown, formData: FormData) {
  const user = await requireUser();
  const existing = await db.membership.findFirst({ where: { userId: user.id } });
  if (existing) redirect("/dashboard");

  const parsed = onboardingSchema.safeParse({
    role: formData.get("role"),
    orgName: formData.get("orgName"),
    industry: formData.get("industry"),
    teamSize: formData.get("teamSize"),
    platforms: formData.get("platforms") ?? "[]",
    goals: formData.get("goals") ?? "[]",
  });
  if (!parsed.success) return { ok: false, error: "Please complete every step" };

  const platforms = parseJson<string[]>(parsed.data.platforms, []);
  const goals = parseJson<string[]>(parsed.data.goals, []);

  let orgSlug = slugify(parsed.data.orgName);
  if (await db.organization.findUnique({ where: { slug: orgSlug } })) {
    orgSlug = `${orgSlug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const freePlan = await db.plan.findUnique({ where: { key: "free" } });

  const org = await db.organization.create({
    data: {
      name: parsed.data.orgName,
      slug: orgSlug,
      type: parsed.data.role,
      memberships: { create: { userId: user.id, role: "owner" } },
      ...(freePlan
        ? {
            subscription: {
              create: {
                planId: freePlan.id,
                status: "trialing",
                interval: "month",
                currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000),
                trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
              },
            },
          }
        : {}),
    },
  });

  const ws = await db.workspace.create({
    data: {
      orgId: org.id,
      name: parsed.data.orgName,
      slug: slugify(parsed.data.orgName) || "main",
      kind: "brand",
      industry: parsed.data.industry,
      members: { create: { userId: user.id, role: "manager" } },
    },
  });

  // Default pillars.
  await db.contentPillar.createMany({
    data: [
      { workspaceId: ws.id, name: "Educational", color: "#6f262c", targetPercent: 40 },
      { workspaceId: ws.id, name: "Behind the scenes", color: "#3d2a2d", targetPercent: 25 },
      { workspaceId: ws.id, name: "Social proof", color: "#4a6b82", targetPercent: 20 },
      { workspaceId: ws.id, name: "Promotional", color: "#cc8b86", targetPercent: 15 },
    ],
  });

  // Default content goals from selected goals.
  const goalData: { workspaceId: string; metric: string; target: number; period: string }[] = [
    { workspaceId: ws.id, metric: "posts_per_week", target: 5, period: "weekly" },
  ];
  if (goals.includes("grow_followers")) goalData.push({ workspaceId: ws.id, metric: "follower_growth", target: 500, period: "monthly" });
  if (goals.includes("increase_engagement")) goalData.push({ workspaceId: ws.id, metric: "engagement_rate", target: 4, period: "monthly" });
  await db.contentGoal.createMany({ data: goalData });

  await db.workspace.update({
    where: { id: ws.id },
    data: { brandBrain: `Primary platforms: ${platforms.join(", ") || "not set"}. Goals: ${goals.join(", ") || "not set"}.` },
  });

  await logAudit({ orgId: org.id, actorId: user.id, action: "onboarding.completed", targetType: "organization", targetId: org.id, metadata: { role: parsed.data.role, platforms, goals } });

  // Point any referral rewards earned before this user had an org at the new one.
  await import("@/lib/referrals").then((m) => m.reconcileReferralRewards(user.id, org.id)).catch(() => {});

  const jar = await cookies();
  jar.set(WS_COOKIE, ws.id, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: isProduction });
  redirect("/dashboard");
}
