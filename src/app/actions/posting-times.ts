"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser, requireWorkspace } from "@/lib/session";
import { can } from "@/lib/rbac";
import { IMPERSONATION_BLOCKED_MESSAGE } from "@/lib/impersonation";
import { isValidTimezone } from "@/lib/timezones";
import { logActivity } from "@/lib/events";
import { ALL_EMPTY_CHANNELS, POSTS_PER_WEEK, POSTING_RESEARCH, suggestSlots } from "@/lib/posting-times";

type Result<T = undefined> = { ok: boolean; error?: string; message?: string; data?: T };

/**
 * Set a channel's weekly posting times from published research (see lib/posting-times.ts). It never changes times the person set:
 * a channel that already has times is left alone unless `replace` is true, which only the explicit "use suggested times instead"
 * button sends.
 */
export async function applySuggestedTimesAction(target: string, perWeek: number, replace = false): Promise<Result<{ channels: number; slots: number }>> {
  const ctx = await requireWorkspace();
  if (ctx.user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (!can(ctx.active.role, "content.publish")) return { ok: false, error: "You don't have permission to change the posting schedule." };
  if (!(POSTS_PER_WEEK as readonly number[]).includes(perWeek)) return { ok: false, error: "Choose 1, 3 or 5 posts a week." };
  if (typeof target !== "string" || !target) return { ok: false, error: "Invalid request" };

  const wsId = ctx.active.workspace.id;
  const channels = await db.socialChannel.findMany({
    where: target === ALL_EMPTY_CHANNELS ? { workspaceId: wsId } : { workspaceId: wsId, id: target },
    select: { id: true, platform: true, name: true, _count: { select: { queueSlots: true } } },
  });
  if (channels.length === 0) return { ok: false, error: "Channel not found" };

  const todo = channels.filter((c) => (target === ALL_EMPTY_CHANNELS ? c._count.queueSlots === 0 : replace || c._count.queueSlots === 0));
  if (todo.length === 0) {
    return {
      ok: false,
      error: target === ALL_EMPTY_CHANNELS ? "Every channel already has posting times." : `${channels[0].name} already has posting times. Edit them in Settings, Workspace.`,
    };
  }

  let slotCount = 0;
  for (const c of todo) {
    const slots = suggestSlots(c.platform, perWeek);
    slotCount += slots.length;
    await db.$transaction([
      db.queueSlot.deleteMany({ where: { channelId: c.id, workspaceId: wsId } }),
      db.queueSlot.createMany({ data: slots.map((s) => ({ workspaceId: wsId, channelId: c.id, weekday: s.weekday, hour: s.hour, minute: s.minute })) }),
    ]);
  }
  await logActivity({
    workspaceId: wsId,
    actorId: ctx.user.id,
    verb: "updated",
    entityType: "channel",
    entityId: todo[0].id,
    summary: `Set posting times for ${todo.length} channel${todo.length === 1 ? "" : "s"} from ${POSTING_RESEARCH.source} ${POSTING_RESEARCH.updated} research`,
  }).catch(() => undefined);
  revalidatePath("/queue");
  revalidatePath("/settings/workspace");
  return { ok: true, message: `Posting times set for ${todo.length} channel${todo.length === 1 ? "" : "s"}`, data: { channels: todo.length, slots: slotCount } };
}

/**
 * Change the person's own time zone (Profile). Offered when the profile zone and the device disagree, because posting times are
 * kept in the profile zone: "9 a.m." in a profile set to UTC is not 9 a.m. for someone in India.
 */
export async function setProfileTimezoneAction(tz: string): Promise<Result> {
  const user = await requireUser();
  if (user.isImpersonated) return { ok: false, error: IMPERSONATION_BLOCKED_MESSAGE };
  if (!isValidTimezone(tz)) return { ok: false, error: "Choose a valid time zone" };
  await db.user.update({ where: { id: user.id }, data: { timezone: tz } });
  // The zone feeds analytics days, the calendar, best-time suggestions and "Add to queue" on every page.
  revalidatePath("/", "layout");
  return { ok: true, message: "Time zone updated" };
}
