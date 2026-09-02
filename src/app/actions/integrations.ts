"use server";

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORMS, WEBHOOK_EVENTS, API_SCOPES, type PlatformKey } from "@/lib/constants";
import { logActivity, logAudit } from "@/lib/events";
import { bumpUsage } from "@/lib/adapters/billing";
import { withPermission, ok, fail } from "./_helpers";

/**
 * Stub OAuth connect — in production this is the provider callback handler.
 * Creates a SocialAccount + a default SocialChannel with seeded follower count.
 */
export async function connectAccountAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("channels.connect");
  const platform = String(formData.get("platform")) as PlatformKey;
  const handle = String(formData.get("handle") ?? "").trim().replace(/^@/, "");
  if (!PLATFORMS[platform]) return fail("Unknown platform");
  if (!handle) return fail("Enter the account handle");

  const dupe = await db.socialAccount.findFirst({
    where: { workspaceId: ctx.active.workspace.id, platform, handle: `@${handle}` },
  });
  if (dupe) return fail("That account is already connected");

  const acct = await db.socialAccount.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      platform,
      displayName: handle,
      handle: `@${handle}`,
      status: "connected",
      accessToken: `stub_${randomBytes(8).toString("hex")}`,
      tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000),
      scopes: "read,write",
      lastSyncedAt: new Date(),
    },
  });
  await db.socialChannel.create({
    data: {
      workspaceId: ctx.active.workspace.id,
      socialAccountId: acct.id,
      platform,
      name: handle,
      handle: `@${handle}`,
      followerCount: 500 + Math.floor(Math.random() * 20000),
    },
  });
  // Seed default queue slots Mon/Wed/Fri 9 & 17.
  const channel = await db.socialChannel.findFirst({ where: { socialAccountId: acct.id } });
  if (channel) {
    for (const wd of [1, 3, 5]) {
      for (const hr of [9, 17]) {
        await db.queueSlot.create({ data: { workspaceId: ctx.active.workspace.id, channelId: channel.id, weekday: wd, hour: hr } });
      }
    }
  }
  await bumpUsage(ctx.active.org.id, "channels");
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "connected",
    entityType: "socialAccount",
    entityId: acct.id,
    summary: `Connected ${PLATFORMS[platform].label} (@${handle})`,
  });
  revalidatePath("/integrations");
  return ok(undefined, `${PLATFORMS[platform].label} connected`);
}

export async function reconnectAccountAction(id: string) {
  const ctx = await withPermission("channels.connect");
  const acct = await db.socialAccount.findUnique({ where: { id } });
  if (!acct || acct.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  await db.socialAccount.update({
    where: { id },
    data: { status: "connected", tokenExpiresAt: new Date(Date.now() + 30 * 86_400_000), lastSyncedAt: new Date() },
  });
  revalidatePath("/integrations");
  return ok(undefined, "Reconnected");
}

export async function disconnectAccountAction(id: string) {
  const ctx = await withPermission("channels.connect");
  const acct = await db.socialAccount.findUnique({ where: { id }, include: { channels: true } });
  if (!acct || acct.workspaceId !== ctx.active.workspace.id) return fail("Not found");
  const scheduled = await db.postChannel.count({
    where: { channelId: { in: acct.channels.map((c) => c.id) }, status: "scheduled" },
  });
  if (scheduled > 0) return fail(`${scheduled} scheduled post(s) use this account. Reschedule or remove them first.`);
  await db.socialAccount.delete({ where: { id } });
  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "disconnected",
    entityType: "socialAccount",
    entityId: id,
    summary: `Disconnected ${acct.platform} (${acct.handle})`,
  });
  revalidatePath("/integrations");
  return ok(undefined, "Disconnected");
}

/* ---------------- API keys ---------------- */

export async function createApiKeyAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("integrations.manage");
  const name = String(formData.get("name") ?? "").trim();
  const scopes = formData.getAll("scopes").map(String).filter((s) => (API_SCOPES as readonly string[]).includes(s));
  if (!name) return fail("Name the key");

  const raw = `cad_live_${randomBytes(16).toString("hex")}`;
  const prefix = raw.slice(0, 16);
  await db.apiKey.create({
    data: {
      orgId: ctx.active.org.id,
      name,
      prefix,
      hashedKey: createHash("sha256").update(raw).digest("hex"),
      scopes: JSON.stringify(scopes.length ? scopes : ["posts:read"]),
    },
  });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "apikey.created", targetType: "apiKey", targetId: prefix });
  revalidatePath("/settings/api");
  // Return the raw key ONCE.
  return ok({ raw }, "API key created — copy it now, it won't be shown again");
}

export async function revokeApiKeyAction(id: string) {
  const ctx = await withPermission("integrations.manage");
  const key = await db.apiKey.findUnique({ where: { id } });
  if (!key || key.orgId !== ctx.active.org.id) return fail("Not found");
  await db.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAudit({ orgId: ctx.active.org.id, actorId: ctx.user.id, action: "apikey.revoked", targetType: "apiKey", targetId: key.prefix });
  revalidatePath("/settings/api");
  return ok(undefined, "Key revoked");
}

/* ---------------- Webhooks ---------------- */

const webhookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).min(1),
});

export async function createWebhookAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("integrations.manage");
  const parsed = webhookSchema.safeParse({
    url: formData.get("url"),
    events: formData.getAll("events").map(String).filter((e) => (WEBHOOK_EVENTS as readonly string[]).includes(e)),
  });
  if (!parsed.success) return fail("Enter a valid URL and pick at least one event");
  await db.webhook.create({
    data: {
      orgId: ctx.active.org.id,
      url: parsed.data.url,
      events: JSON.stringify(parsed.data.events),
      secret: `whsec_${randomBytes(12).toString("hex")}`,
    },
  });
  revalidatePath("/settings/api");
  return ok(undefined, "Webhook created");
}

export async function deleteWebhookAction(id: string) {
  const ctx = await withPermission("integrations.manage");
  const wh = await db.webhook.findUnique({ where: { id } });
  if (!wh || wh.orgId !== ctx.active.org.id) return fail("Not found");
  await db.webhook.delete({ where: { id } });
  revalidatePath("/settings/api");
  return ok(undefined, "Webhook deleted");
}

export async function testWebhookAction(id: string) {
  const ctx = await withPermission("integrations.manage");
  const wh = await db.webhook.findUnique({ where: { id } });
  if (!wh || wh.orgId !== ctx.active.org.id) return fail("Not found");
  await db.webhookDelivery.create({
    data: {
      webhookId: id,
      event: "test.ping",
      payload: JSON.stringify({ test: true, at: new Date().toISOString() }),
      statusCode: 200,
      success: true,
    },
  });
  revalidatePath("/settings/api");
  return ok(undefined, "Test event sent");
}
