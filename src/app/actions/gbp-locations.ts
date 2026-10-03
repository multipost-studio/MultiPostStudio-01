"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { logActivity } from "@/lib/events";
import { bumpUsage, debumpUsage } from "@/lib/adapters/billing";
import { refreshIfNeeded } from "@/lib/social/oauth";
import { fetchGbpAllLocations, type GbpAccount, type GbpLocation } from "@/lib/integrations/gbp";
import { withPermission, ensureInWorkspace, limitGuard, ok, fail } from "./_helpers";

export type GbpLocationItem = GbpLocation & {
  connected: boolean;
  channelId?: string;
};

export type GbpLocationDiscoveryResult = {
  accountEmail: string;
  accountDisplayName: string;
  accounts: GbpAccount[];
  locations: GbpLocationItem[];
};

/**
 * Retrieves accessible Google Business Profile accounts and locations for a connected SocialAccount.
 * Validates workspace membership and multi-tenant security.
 */
export async function getGbpLocationsAction(accountId: string) {
  const ctx = await withPermission("channels.connect");
  try {
    await ensureInWorkspace("socialAccount", accountId, ctx.active.workspace.id);

    const account = await db.socialAccount.findUnique({
      where: { id: accountId },
      include: {
        channels: {
          where: { workspaceId: ctx.active.workspace.id },
          select: { id: true, handle: true, name: true },
        },
      },
    });

    if (!account || account.platform !== "gbp") {
      return fail("Google Business Profile account not found in this workspace");
    }

    const token = await refreshIfNeeded(account.id);
    if (!token) {
      return fail("Google authorization expired — please reconnect Google Business Profile");
    }

    let accounts: GbpAccount[] = [];
    let locations: GbpLocation[] = [];

    try {
      const res = await fetchGbpAllLocations(token);
      accounts = res.accounts;
      locations = res.locations;

      // Update cached metadata
      let metaObj: Record<string, unknown> = {};
      try {
        metaObj = account.metadata ? JSON.parse(account.metadata) : {};
      } catch {
        metaObj = {};
      }
      metaObj.accounts = accounts;
      metaObj.locations = locations;
      metaObj.lastDiscoveredAt = new Date().toISOString();

      await db.socialAccount.update({
        where: { id: account.id },
        data: { metadata: JSON.stringify(metaObj) },
      });
    } catch (apiErr) {
      logger.warn({ err: apiErr, accountId }, "live GBP location discovery failed; falling back to cached metadata");
      try {
        const metaObj = account.metadata ? JSON.parse(account.metadata) : {};
        accounts = (metaObj.accounts as GbpAccount[]) ?? [];
        locations = (metaObj.locations as GbpLocation[]) ?? [];
      } catch {
        accounts = [];
        locations = [];
      }
    }

    const connectedMap = new Map(account.channels.map((c) => [c.handle, c.id]));

    const locationItems: GbpLocationItem[] = locations.map((loc) => ({
      ...loc,
      connected: connectedMap.has(loc.name),
      channelId: connectedMap.get(loc.name),
    }));

    return ok<GbpLocationDiscoveryResult>({
      accountEmail: account.handle,
      accountDisplayName: account.displayName,
      accounts,
      locations: locationItems,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load Google Business Profile locations";
    return fail(msg);
  }
}

/**
 * Saves selected locations as active SocialChannels for the workspace.
 * Strict multi-tenant security: verifies account belongs to workspace and locations belong to the account.
 */
export async function saveGbpLocationsAction(accountId: string, selectedLocationNames: string[]) {
  const ctx = await withPermission("channels.connect");
  try {
    await ensureInWorkspace("socialAccount", accountId, ctx.active.workspace.id);

    const account = await db.socialAccount.findUnique({
      where: { id: accountId },
      include: {
        channels: {
          where: { workspaceId: ctx.active.workspace.id },
        },
      },
    });

    if (!account || account.platform !== "gbp") {
      return fail("Google Business Profile account not found in this workspace");
    }

    let metaObj: { locations?: GbpLocation[] } = {};
    try {
      metaObj = account.metadata ? JSON.parse(account.metadata) : {};
    } catch {
      metaObj = {};
    }

    const availableLocations = metaObj.locations ?? [];
    const locationByName = new Map(availableLocations.map((l) => [l.name, l]));

    // Multi-tenant check: all selected location names must exist in the account's discovered locations
    const selectedLocs: GbpLocation[] = [];
    for (const name of selectedLocationNames) {
      const loc = locationByName.get(name);
      if (loc) {
        selectedLocs.push(loc);
      }
    }

    const currentChannelsByHandle = new Map(account.channels.map((c) => [c.handle, c]));
    const currentHandles = new Set(account.channels.map((c) => c.handle));
    const selectedHandles = new Set(selectedLocationNames);

    // Channels to remove
    const toRemove = account.channels.filter((c) => !selectedHandles.has(c.handle));
    for (const chan of toRemove) {
      const scheduledCount = await db.postChannel.count({
        where: { channelId: chan.id, status: "scheduled" },
      });
      if (scheduledCount > 0) {
        return fail(
          `Cannot disconnect location "${chan.name}": it has ${scheduledCount} scheduled post(s). Unschedule or reschedule them first.`,
        );
      }
    }

    // Channels to add
    const toAdd = selectedLocs.filter((l) => !currentHandles.has(l.name));

    // Limit check for new channels
    if (toAdd.length > 0) {
      const orgId = ctx.active.org.id;
      const chCount = await db.socialChannel.count({ where: { workspace: { orgId } } });
      const lim = await limitGuard(orgId, "maxChannels", chCount + toAdd.length, "connected channels");
      if (lim) return lim;
    }

    // Apply additions
    for (const loc of toAdd) {
      const channel = await db.socialChannel.create({
        data: {
          workspaceId: ctx.active.workspace.id,
          socialAccountId: account.id,
          platform: "gbp",
          name: loc.title,
          handle: loc.name,
          avatarUrl: null,
          metadata: JSON.stringify({
            storeCode: loc.storeCode,
            address: loc.storefrontAddress,
            websiteUri: loc.websiteUri,
            phone: loc.phoneNumbers?.primaryPhone,
            category: loc.categories?.primaryCategory?.displayName,
            accountName: loc.accountName,
            accountTitle: loc.accountTitle,
          }),
        },
      });

      // Seed default queue slots Mon/Wed/Fri 9 & 17
      for (const wd of [1, 3, 5]) {
        for (const hr of [9, 17]) {
          await db.queueSlot.create({
            data: {
              workspaceId: ctx.active.workspace.id,
              channelId: channel.id,
              weekday: wd,
              hour: hr,
            },
          });
        }
      }

      await bumpUsage(ctx.active.org.id, "channels");
    }

    // Apply removals
    for (const chan of toRemove) {
      await db.socialChannel.delete({ where: { id: chan.id } });
      await debumpUsage(ctx.active.org.id, "channels");
    }

    const totalConnected = account.channels.length - toRemove.length + toAdd.length;

    await logActivity({
      workspaceId: ctx.active.workspace.id,
      actorId: ctx.user.id,
      verb: "updated",
      entityType: "socialAccount",
      entityId: account.id,
      summary: `Updated Google Business Profile locations: ${totalConnected} connected (+${toAdd.length}, -${toRemove.length})`,
    });

    revalidatePath("/integrations");
    revalidatePath("/composer");
    revalidatePath("/calendar");

    return ok(undefined, `Connected ${totalConnected} Google Business Profile location(s)`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to save Google Business Profile locations";
    return fail(msg);
  }
}
