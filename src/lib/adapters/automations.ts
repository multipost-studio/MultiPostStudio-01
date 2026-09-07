import { db } from "@/lib/db";
import { parseJson } from "@/lib/utils";
import { notifyWorkspace, logActivity } from "@/lib/events";
import { scorePost } from "@/lib/scoring";
import { isSupportedPair } from "@/lib/automations";
import type { PlatformKey } from "@/lib/constants";

/**
 * Automation engine. Evaluated on each cron tick; each automation runs at most
 * once per 60s.
 *
 * Triggers look at what changed *since this automation last ran* rather than
 * inside a fixed recent window. A fixed 120s window with a 60s run gate meant
 * one published post fell inside two consecutive windows and notified the
 * whole workspace twice.
 *
 * Every trigger/action pair handled here is declared in `@/lib/automations`,
 * which is also what the form offers — the two must not drift, or users get
 * back automations that save successfully and never run.
 */

/** How far back to look on the first run, before there is a lastRunAt. */
const FIRST_RUN_LOOKBACK_MS = 120_000;

export async function runDueAutomations(now = new Date()) {
  const autos = await db.automation.findMany({ where: { enabled: true } });
  let ran = 0;

  for (const a of autos) {
    if (a.lastRunAt && now.getTime() - a.lastRunAt.getTime() < 60_000) continue;

    let detail = "No matching entity";
    let status: "success" | "skipped" = "skipped";

    // Everything strictly after this point is new since the last evaluation,
    // so nothing is acted on twice.
    const since = a.lastRunAt ?? new Date(now.getTime() - FIRST_RUN_LOOKBACK_MS);

    try {
      if (!isSupportedPair(a.triggerType, a.actionType)) {
        // Pre-existing rows from when the form offered unimplemented pairs.
        // Say so in the run log instead of reporting "no matching entity"
        // forever, which reads like the trigger simply never fired.
        detail = `Unsupported combination (${a.triggerType} → ${a.actionType}) — this automation cannot run. Recreate it with a supported action.`;
      } else if (a.triggerType === "post_published") {
        const recent = await db.post.findMany({
          where: { workspaceId: a.workspaceId, status: "published", publishedAt: { gt: since } },
          orderBy: { publishedAt: "desc" },
          take: 20,
        });
        if (recent.length > 0) {
          if (a.actionType === "notify") {
            await notifyWorkspace(a.workspaceId, {
              type: "system",
              title: "Automation: post published",
              body: `"${recent[0].title ?? "A post"}" just went live.`,
              linkUrl: `/composer/${recent[0].id}`,
            });
            status = "success";
            detail = `Notified on ${recent.length} published post(s)`;
          } else if (a.actionType === "recommend_repurpose") {
            await notifyWorkspace(a.workspaceId, {
              type: "system",
              title: "Ready to repurpose",
              body: `"${recent[0].title ?? "A post"}" is published — repurpose it for your other channels.`,
              linkUrl: `/composer/${recent[0].id}`,
            });
            status = "success";
            detail = `Suggested repurposing for ${recent.length} published post(s)`;
          }
        }
      } else if (a.triggerType === "high_engagement") {
        const cfg = parseJson<{ threshold?: number }>(a.triggerConfig, {});
        const threshold = cfg.threshold ?? 5;
        const metrics = await db.postMetric.findMany({
          where: { post: { workspaceId: a.workspaceId }, engagementRate: { gte: threshold } },
          select: { postId: true },
          take: 20,
        });
        const ids = [...new Set(metrics.map((m) => m.postId))];

        if (a.actionType === "tag_high_performer") {
          const tagName = parseJson<{ tag?: string }>(a.actionConfig, {}).tag ?? "evergreen";
          const tag = await db.tag.findFirst({ where: { workspaceId: a.workspaceId, name: tagName } });
          if (tag) {
            let tagged = 0;
            for (const postId of ids) {
              const exists = await db.tagOnPost.findUnique({
                where: { postId_tagId: { postId, tagId: tag.id } },
              });
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
          } else {
            detail = `No "${tagName}" tag in this workspace — create it to use this automation`;
          }
        } else if (a.actionType === "recommend_repurpose") {
          // Marking them evergreen is what makes them eligible for the
          // recycling queue, so the recommendation is actionable, not just a
          // notification. Only posts not already marked count as work done.
          const fresh = await db.post.findMany({
            where: { id: { in: ids }, isEvergreen: false },
            select: { id: true, title: true },
          });
          if (fresh.length > 0) {
            await db.post.updateMany({
              where: { id: { in: fresh.map((p) => p.id) } },
              data: { isEvergreen: true },
            });
            await notifyWorkspace(a.workspaceId, {
              type: "system",
              title: "High performers ready to recycle",
              body: `${fresh.length} post(s) above ${threshold}% engagement were marked evergreen.`,
              linkUrl: "/recycling",
            });
            status = "success";
            detail = `Marked ${fresh.length} high performer(s) evergreen for recycling`;
          }
        } else if (a.actionType === "notify") {
          // Only tell people about posts that crossed the line since last run.
          const fresh = await db.post.findMany({
            where: { id: { in: ids }, workspaceId: a.workspaceId, publishedAt: { gt: since } },
            select: { id: true, title: true },
            take: 20,
          });
          if (fresh.length > 0) {
            await notifyWorkspace(a.workspaceId, {
              type: "system",
              title: "Automation: high engagement",
              body: `"${fresh[0].title ?? "A post"}" is above ${threshold}% engagement.`,
              linkUrl: `/composer/${fresh[0].id}`,
            });
            status = "success";
            detail = `Notified on ${fresh.length} high-engagement post(s)`;
          }
        }
      } else if (a.triggerType === "draft_created") {
        const drafts = await db.post.findMany({
          where: {
            workspaceId: a.workspaceId,
            status: "draft",
            ...(a.actionType === "run_ai_optimize" ? { prediction: { is: null } } : {}),
            createdAt: { gt: since },
          },
          include: { channels: true, media: true },
          take: 20,
        });

        if (drafts.length > 0) {
          if (a.actionType === "run_ai_optimize") {
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
          } else if (a.actionType === "notify") {
            await notifyWorkspace(a.workspaceId, {
              type: "system",
              title: "Automation: draft created",
              body: `"${drafts[0].title ?? "A draft"}" was created and is waiting for work.`,
              linkUrl: `/composer/${drafts[0].id}`,
            });
            status = "success";
            detail = `Notified on ${drafts.length} new draft(s)`;
          }
        }
      } else if (a.triggerType === "approval_requested" && a.actionType === "notify") {
        // Requests raised since the last run, for posts in this workspace.
        const requests = await db.approvalRequest.findMany({
          where: {
            status: "in_review",
            createdAt: { gt: since },
            post: { workspaceId: a.workspaceId },
          },
          select: { id: true, postId: true, post: { select: { title: true } } },
          take: 20,
        });
        if (requests.length > 0) {
          await notifyWorkspace(a.workspaceId, {
            type: "system",
            title: "Automation: approval requested",
            body: `"${requests[0].post.title ?? "A post"}" is waiting for approval.`,
            linkUrl: `/approvals`,
          });
          status = "success";
          detail = `Notified on ${requests.length} approval request(s)`;
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
