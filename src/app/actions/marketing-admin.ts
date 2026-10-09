"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { describeFilter, isEmptyFilter, normalizeSegmentFilter, type SegmentFilter, type SegmentFilterInput } from "@/lib/audience";
import { isSafeCtaUrl } from "@/lib/promo-cards";
import { resolveAudience } from "@/lib/marketing-analytics";

export type AudiencePreview = {
  total: number;
  truncated: boolean;
  byPlan: { plan: string; count: number }[];
  sample: { id: string; name: string; email: string; plan: string; channel: string | null; source: string | null; campaign: string | null; createdAt: string }[];
  description: string;
};

type Fail = { ok: false; error: string };

const SAMPLE = 25;
/** In-app broadcast ceiling per send: big enough for real campaigns, small enough that a mis-click is recoverable. */
const BROADCAST_MAX = 5000;

export async function previewAudienceAction(input: SegmentFilterInput): Promise<{ ok: true; preview: AudiencePreview } | Fail> {
  await requireAdminPermission("marketing.view");
  const filter = normalizeSegmentFilter(input);
  try {
    const a = await resolveAudience(filter);
    return {
      ok: true,
      preview: {
        total: a.total,
        truncated: a.truncated,
        byPlan: a.byPlan,
        description: describeFilter(filter),
        sample: a.members.slice(0, SAMPLE).map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })),
      },
    };
  } catch (err) {
    logger.error({ err }, "previewAudienceAction failed");
    return { ok: false, error: "Couldn't load this audience. If this is a new deploy, check the latest database migration has been applied." };
  }
}

const nameSchema = z.string().trim().min(1, "Give the audience a name").max(80);

export async function saveSegmentAction(input: { id?: string; name: string; filter: SegmentFilterInput }): Promise<{ ok: true; id: string } | Fail> {
  const admin = await requireAdminPermission("marketing.manage");
  const name = nameSchema.safeParse(input.name);
  if (!name.success) return { ok: false, error: name.error.issues[0]?.message ?? "Invalid name" };
  const filter = normalizeSegmentFilter(input.filter);
  try {
    const data = { name: name.data, filter: JSON.stringify(filter) };
    const row = input.id
      ? await db.marketingSegment.update({ where: { id: input.id }, data })
      : await db.marketingSegment.create({ data: { ...data, createdById: admin.id } });
    await logAudit({ actorId: admin.id, action: input.id ? "segment.update" : "segment.create", targetType: "MarketingSegment", targetId: row.id, metadata: { name: name.data } });
    revalidatePath("/admin/marketing/audiences");
    return { ok: true, id: row.id };
  } catch (err) {
    logger.error({ err }, "saveSegmentAction failed");
    return { ok: false, error: "Couldn't save the audience." };
  }
}

export async function deleteSegmentAction(id: string): Promise<{ ok: true } | Fail> {
  const admin = await requireAdminPermission("marketing.manage");
  try {
    await db.marketingSegment.delete({ where: { id } });
    await logAudit({ actorId: admin.id, action: "segment.delete", targetType: "MarketingSegment", targetId: id });
    revalidatePath("/admin/marketing/audiences");
    return { ok: true };
  } catch (err) {
    logger.error({ err }, "deleteSegmentAction failed");
    return { ok: false, error: "Couldn't delete the audience." };
  }
}

/**
 * Send an in-app notification to everyone in an audience.
 *
 * Safety rails, because this reaches real users: the caller must pass the
 * recipient count they reviewed, and the send is refused if the audience has
 * changed since; an empty filter ("everyone") is refused here (use Broadcast
 * for that); and there is a hard recipient cap.
 */
export async function broadcastToAudienceAction(input: {
  filter: SegmentFilterInput;
  title: string;
  body: string;
  linkUrl?: string;
  expectedTotal: number;
}): Promise<{ ok: true; sent: number } | Fail> {
  const admin = await requireAdminPermission("broadcast.send");
  const title = input.title.trim().slice(0, 140);
  const body = input.body.trim().slice(0, 2000);
  if (!title || !body) return { ok: false, error: "Title and message are required." };
  const linkUrl = input.linkUrl?.trim() || null;
  if (linkUrl && !isSafeCtaUrl(linkUrl)) return { ok: false, error: "Use an in-app path like /settings/billing or an https:// link." };

  const filter: SegmentFilter = normalizeSegmentFilter(input.filter);
  if (isEmptyFilter(filter)) return { ok: false, error: "Choose who to send to. To message every user, use Broadcast." };

  try {
    const audience = await resolveAudience(filter);
    if (audience.total !== input.expectedTotal) {
      return { ok: false, error: `This audience has changed (now ${audience.total} people, you reviewed ${input.expectedTotal}). Review and send again.` };
    }
    if (audience.total === 0) return { ok: false, error: "No one matches this audience." };
    if (audience.total > BROADCAST_MAX || audience.truncated) return { ok: false, error: `Audiences over ${BROADCAST_MAX} people can't be messaged at once. Narrow it first.` };

    for (let i = 0; i < audience.members.length; i += 1000) {
      await db.notification.createMany({
        data: audience.members.slice(i, i + 1000).map((m) => ({ userId: m.id, type: "system", title, body, linkUrl })),
      });
    }
    await logAudit({
      actorId: admin.id,
      action: "marketing.audience_broadcast",
      targetType: "MarketingSegment",
      targetId: "adhoc",
      metadata: { title, recipients: audience.total, audience: describeFilter(filter) },
    });
    return { ok: true, sent: audience.total };
  } catch (err) {
    logger.error({ err }, "broadcastToAudienceAction failed");
    return { ok: false, error: "Couldn't send the message." };
  }
}
