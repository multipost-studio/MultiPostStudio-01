"use server";

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PLATFORMS, WEBHOOK_EVENTS, API_SCOPES, type PlatformKey } from "@/lib/constants";
import { logActivity, logAudit } from "@/lib/events";
import { bumpUsage } from "@/lib/adapters/billing";
import { sendTestEvent } from "@/lib/adapters/webhooks";
import { blueskyLogin, blueskyGetProfile } from "@/lib/social/bluesky";
import { encryptToken } from "@/lib/social/crypto";
import { withPermission, entitlementGuard, limitGuard, ok, fail } from "./_helpers";

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

  const orgId = ctx.active.org.id;
  const platEnt = await entitlementGuard(orgId, `platform_${platform}`, `Publishing to ${PLATFORMS[platform]?.label ?? platform}`);
  if (platEnt) return platEnt;
  const chCount = await db.socialChannel.count({ where: { workspace: { orgId } } });
  const lim = await limitGuard(orgId, "maxChannels", chCount, "connected channels");
  if (lim) return lim;

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
      followerCount: 0, // real value comes from a platform sync, never fabricated
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

/**
 * Real Bluesky connect via app password (no OAuth app needed).
 * Create one at https://bsky.app/settings/app-passwords.
 */
export async function connectBlueskyAction(_prev: unknown, formData: FormData) {
  const ctx = await withPermission("channels.connect");
  const identifier = String(formData.get("identifier") ?? "").trim().replace(/^@/, "");
  const appPassword = String(formData.get("appPassword") ?? "").trim();
  if (!identifier || !appPassword) return fail("Enter your Bluesky handle and an app password");

  const bOrgId = ctx.active.org.id;
  const bEnt = await entitlementGuard(bOrgId, "platform_bluesky", "Publishing to Bluesky");
  if (bEnt) return bEnt;
  const bCount = await db.socialChannel.count({ where: { workspace: { orgId: bOrgId } } });
  const bLim = await limitGuard(bOrgId, "maxChannels", bCount, "connected channels");
  if (bLim) return bLim;

  let session;
  try {
    session = await blueskyLogin(identifier, appPassword);
  } catch {
    return fail("Bluesky rejected those credentials. Use an app password, not your main password.");
  }

  const handle = `@${session.handle}`;

  // Real profile stats from the platform — never fabricated.
  const prof = await blueskyGetProfile(session.did, session.accessJwt).catch(() => null);
  const displayName = prof?.displayName?.trim() || session.handle;

  const existing = await db.socialAccount.findFirst({
    where: { workspaceId: ctx.active.workspace.id, platform: "bluesky", handle },
  });
  const data = {
    workspaceId: ctx.active.workspace.id,
    platform: "bluesky",
    displayName,
    avatarUrl: prof?.avatar ?? null,
    handle,
    status: "connected",
    accessToken: encryptToken(session.accessJwt),
    refreshToken: encryptToken(session.refreshJwt),
    tokenExpiresAt: null,
    scopes: "post",
    metadata: JSON.stringify({ did: session.did, pds: "https://bsky.social" }),
    lastSyncedAt: new Date(),
  };
  const acct = existing
    ? await db.socialAccount.update({ where: { id: existing.id }, data })
    : await db.socialAccount.create({ data });

  const chan = await db.socialChannel.findFirst({ where: { socialAccountId: acct.id } });
  if (chan) {
    await db.socialChannel.update({
      where: { id: chan.id },
      data: {
        name: displayName,
        avatarUrl: prof?.avatar ?? null,
        followerCount: prof?.followersCount ?? chan.followerCount,
      },
    });
  } else {
    await db.socialChannel.create({
      data: {
        workspaceId: ctx.active.workspace.id,
        socialAccountId: acct.id,
        platform: "bluesky",
        name: displayName,
        avatarUrl: prof?.avatar ?? null,
        handle,
        followerCount: prof?.followersCount ?? 0,
      },
    });
    await bumpUsage(ctx.active.org.id, "channels");
  }

  await logActivity({
    workspaceId: ctx.active.workspace.id,
    actorId: ctx.user.id,
    verb: "connected",
    entityType: "socialAccount",
    entityId: acct.id,
    summary: `Connected Bluesky (${handle})`,
  });
  revalidatePath("/integrations");
  return ok(undefined, "Bluesky connected");
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
  const ent = await entitlementGuard(ctx.active.org.id, "api_access", "API access");
  if (ent) return ent;
  const name = String(formData.get("name") ?? "").trim();
  const scopes = formData.getAll("scopes").map(String).filter((s) => (API_SCOPES as readonly string[]).includes(s));
  if (!name) return fail("Name the key");

  const raw = `mps_live_${randomBytes(16).toString("hex")}`;
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
  const ent = await entitlementGuard(ctx.active.org.id, "webhooks", "Webhooks");
  if (ent) return ent;
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
  const res = await sendTestEvent(id); // real signed HTTP POST to wh.url
  revalidatePath("/settings/api");
  if (res.ok) return ok(undefined, `Test event delivered (HTTP ${res.status})`);
  return fail(res.error ? `Delivery failed: ${res.error}` : `Endpoint returned HTTP ${res.status}`);
}
