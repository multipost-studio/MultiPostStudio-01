import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { notifyWorkspace, logActivity } from "@/lib/events";
import { scorePost } from "@/lib/scoring";
import type { PlatformKey } from "@/lib/constants";

/**
 * Stub automation engine. Evaluated on each cron tick. Each automation runs at
 * most once per 60s. Triggers are matched against recent workspace state.
 */
export async function runDueAutomations(now = new Date()) {
  const autos = await db.automation.findMany({ where: { enabled: true } });
  let ran = 0;

  for (const a of autos) {
    if (a.lastRunAt && now.getTime() - a.lastRunAt.getTime() < 60_000) continue;

    let detail = "No matching entity";
    let status: "success" | "skipped" = "skipped";

    try {
      if (a.triggerType === "post_published") {
        const recent = await db.post.findMany({
          where: {
            workspaceId: a.workspaceId,
            status: "published",
            publishedAt: { gte: new Date(now.getTime() - 120_000) },
          },
        });
        if (recent.length > 0 && a.actionType === "notify") {
          await notifyWorkspace(a.workspaceId, {
            type: "system",
            title: "Automation: post published",
            body: `"${recent[0].title ?? "A post"}" just went live.`,
            linkUrl: `/composer/${recent[0].id}`,
          });
          status = "success";
          detail = `Notified on ${recent.length} published post(s)`;
        }
      }

      if (a.triggerType === "high_engagement" && a.actionType === "tag_high_performer") {
        const cfg = parseJson<{ threshold?: number; tag?: string }>(a.triggerConfig, {});
        const threshold = cfg.threshold ?? 5;
        const tagName = parseJson<{ tag?: string }>(a.actionConfig, {}).tag ?? "evergreen";
        const tag = await db.tag.findFirst({ where: { workspaceId: a.workspaceId, name: tagName } });
        if (tag) {
          const metrics = await db.postMetric.findMany({
            where: { post: { workspaceId: a.workspaceId }, engagementRate: { gte: threshold } },
            select: { postId: true },
            take: 20,
          });
          const ids = [...new Set(metrics.map((m) => m.postId))];
          let tagged = 0;
          for (const postId of ids) {
            const exists = await db.tagOnPost.findUnique({ where: { postId_tagId: { postId, tagId: tag.id } } });
            if (!exists) {
              await db.tagOnPost.create({ data: { postId, tagId: tag.id } });
              await db.post.update({ where: { id: postId }, data: { isEvergreen: true } });
              tagged++;
            }
          }
          if (tagged > 0) {
            status = "success";
            detail = `Tagged ${tagged} high performer(s) as "${tagName}"`;
          }
        }
      }

      if (a.triggerType === "draft_created" && a.actionType === "run_ai_optimize") {
        const drafts = await db.post.findMany({
          where: {
            workspaceId: a.workspaceId,
            status: "draft",
            prediction: { is: null },
            createdAt: { gte: new Date(now.getTime() - 300_000) },
          },
          include: { channels: true, media: true },
        });
        let optimized = 0;
        for (const p of drafts) {
          const platform = (p.channels[0]?.platform ?? "instagram") as PlatformKey;
          const body = p.channels[0]?.body ?? "";
          const pred = await scorePost(p.workspaceId, { body, platform, hasMedia: p.media.length > 0 });
          await db.postPrediction.create({
            data: {
              postId: p.id,
              engagementScore: pred.engagementScore,
              clarityScore: pred.clarityScore,
              hookStrength: pred.hookStrength,
              readability: pred.readability,
              ctaScore: pred.ctaScore,
              brandVoiceScore: pred.brandVoiceScore,
              platformFitScore: pred.platformFitScore,
              recommendations: JSON.stringify(pred.recommendations),
            },
          });
          optimized++;
        }
        if (optimized > 0) {
          status = "success";
          detail = `Ran AI optimization on ${optimized} new draft(s)`;
        }
      }
    } catch (e) {
      status = "skipped";
      detail = `Error: ${e instanceof Error ? e.message : "unknown"}`;
    }

    await db.automation.update({
      where: { id: a.id },
      data: {
        lastRunAt: now,
        ...(status === "success" ? { runCount: { increment: 1 } } : {}),
      },
    });
    await db.automationRun.create({ data: { automationId: a.id, status, detail } });
    if (status === "success") {
      ran++;
      await logActivity({
        workspaceId: a.workspaceId,
        verb: "automation",
        entityType: "automation",
        entityId: a.id,
        summary: `Automation "${a.name}" ran: ${detail}`,
      });
    }
  }

  return { ran };
}
