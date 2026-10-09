"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminPermission } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { logger } from "@/lib/logger";
import { sluggify } from "@/lib/blog";
import { interleaveByGroup, planSchedule } from "@/lib/blog-schedule";
import { LAUNCH_AUTHOR, loadLaunchPosts, type LaunchPost } from "@/lib/blog-launch";

export type LaunchPreviewItem = { order: number; slug: string; title: string; category: string; at: string; exists: boolean };
export type LaunchPreview = {
  total: number;
  /** Posts already in the blog (by slug): never touched or duplicated. */
  existing: number;
  toSchedule: number;
  words: number;
  items: LaunchPreviewItem[];
};

export type LaunchResult =
  | { ok: true; message: string; preview?: LaunchPreview; created?: number; skipped?: number; failed?: number; errors?: { slug: string; reason: string }[] }
  | { ok: false; error: string };

const clampPerDay = (n: unknown) => Math.max(1, Math.min(3, Math.floor(Number(n) || 3)));

/** First day = tomorrow (UTC) unless the admin picks a date. */
function startDayFrom(input?: string): Date | null {
  if (!input) {
    const t = new Date(Date.now() + 86_400_000);
    return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) return null;
  const d = new Date(`${input}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function plan(opts: { startDate?: string; perDay?: number }) {
  const startDay = startDayFrom(opts.startDate);
  if (!startDay) return { ok: false as const, error: "Pick a valid start date (YYYY-MM-DD)." };
  const all = await loadLaunchPosts();
  const existing = new Set(
    (await db.blogPost.findMany({ where: { slug: { in: all.map((p) => p.slug) } }, select: { slug: true } })).map((p) => p.slug),
  );
  const fresh = all.filter((p) => !existing.has(p.slug));
  // Round-robin the topic clusters so each day's posts cover different subjects.
  const ordered = interleaveByGroup(fresh, (p) => p.category);
  const slots = planSchedule({ startDay, count: ordered.length, perDay: clampPerDay(opts.perDay), notBefore: new Date(Date.now() + 10 * 60_000) });
  const assigned = ordered.map((post, i) => ({ post, at: slots[i] ?? slots[slots.length - 1] ?? startDay }));
  return { ok: true as const, all, existing, assigned };
}

type Plan = Extract<Awaited<ReturnType<typeof plan>>, { ok: true }>;

function toPreview(r: Plan): LaunchPreview {
  return {
    total: r.all.length,
    existing: r.existing.size,
    toSchedule: r.assigned.length,
    words: r.assigned.reduce((n, a) => n + a.post.content.split(/\s+/).length, 0),
    items: r.assigned.map(({ post, at }) => ({ order: post.order, slug: post.slug, title: post.title, category: post.category, at: at.toISOString(), exists: false })),
  };
}

/** Show exactly what would be scheduled and when. Writes nothing. */
export async function previewLaunchBatchAction(input: { startDate?: string; perDay?: number } = {}): Promise<LaunchResult> {
  await requireAdminPermission("content.manage");
  try {
    const p = await plan(input);
    if (!p.ok) return { ok: false, error: p.error };
    const preview = toPreview(p);
    return {
      ok: true,
      preview,
      message: preview.toSchedule === 0 ? "All launch posts already exist in the blog." : `${preview.toSchedule} posts ready to schedule.`,
    };
  } catch (err) {
    logger.error({ err }, "launch batch preview failed");
    return { ok: false, error: "Couldn't prepare the schedule. Check that the blog database migration has been applied." };
  }
}

async function createScheduled(post: LaunchPost, at: Date, authorId: string, adminName: string) {
  const catSlug = sluggify(post.category);
  const category = await db.blogCategory.upsert({
    where: { slug: catSlug },
    create: { name: post.category, slug: catSlug },
    update: {},
  });
  const created = await db.blogPost.create({
    data: {
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content: post.content,
      status: "scheduled",
      scheduledAt: at,
      readMins: post.readMins,
      authorId,
      categoryId: category.id,
      seoTitle: post.seoTitle,
      seoDescription: post.seoDescription,
      focusKeyword: post.focusKeyword,
      secondaryKeywords: post.secondaryKeywords,
      ogTitle: post.seoTitle,
      ogDescription: post.seoDescription,
      twitterTitle: post.seoTitle,
      twitterDescription: post.seoDescription,
      revisions: { create: { title: post.title, content: post.content, excerpt: post.excerpt, authorName: adminName, summary: "Launch batch" } },
    },
    select: { id: true },
  });
  for (const t of post.tags) {
    const tagSlug = sluggify(t);
    const tag = await db.blogTag.upsert({ where: { slug: tagSlug }, create: { name: t, slug: tagSlug }, update: {} });
    await db.blogPostTag.create({ data: { postId: created.id, tagId: tag.id } }).catch(() => {});
  }
}

/**
 * Create every launch post that doesn't exist yet as SCHEDULED, N per day at
 * randomised times. Idempotent (existing slugs are skipped), and each post stays
 * fully editable / reschedulable in Admin → Blog like any other.
 */
export async function scheduleLaunchBatchAction(input: { startDate?: string; perDay?: number } = {}): Promise<LaunchResult> {
  const admin = await requireAdminPermission("content.manage");
  try {
    const p = await plan(input);
    if (!p.ok) return { ok: false, error: p.error };
    if (p.assigned.length === 0) return { ok: true, message: "Nothing to schedule: every launch post already exists.", created: 0, skipped: p.existing.size, failed: 0, errors: [] };

    const author = await db.blogAuthor.upsert({
      where: { slug: LAUNCH_AUTHOR.slug },
      create: { name: LAUNCH_AUTHOR.name, slug: LAUNCH_AUTHOR.slug, role: LAUNCH_AUTHOR.role },
      update: {},
    });

    let created = 0;
    const errors: { slug: string; reason: string }[] = [];
    for (const { post, at } of p.assigned) {
      try {
        await createScheduled(post, at, author.id, admin.name);
        created++;
      } catch (err) {
        errors.push({ slug: post.slug, reason: err instanceof Error ? err.message.slice(0, 160) : "Database error" });
      }
    }

    await logAudit({
      actorId: admin.id,
      action: "blog.launch_batch_scheduled",
      targetType: "BlogPost",
      targetId: "launch-batch",
      metadata: { created, failed: errors.length, skipped: p.existing.size, perDay: clampPerDay(input.perDay), first: p.assigned[0]?.at.toISOString(), last: p.assigned.at(-1)?.at.toISOString() },
    });
    revalidatePath("/admin/blog");
    revalidatePath("/admin/blog/calendar");
    revalidatePath("/admin/blog/import");
    return {
      ok: true,
      message: `Scheduled ${created} post${created === 1 ? "" : "s"}${errors.length ? `, ${errors.length} failed` : ""}.`,
      created,
      skipped: p.existing.size,
      failed: errors.length,
      errors,
    };
  } catch (err) {
    logger.error({ err }, "launch batch scheduling failed");
    return { ok: false, error: "Couldn't schedule the batch. Check that the blog database migration has been applied." };
  }
}

/** Put every still-scheduled launch post back to draft (published ones are never touched). */
export async function unscheduleLaunchBatchAction(): Promise<LaunchResult> {
  const admin = await requireAdminPermission("content.manage");
  try {
    const slugs = (await loadLaunchPosts()).map((p) => p.slug);
    const res = await db.blogPost.updateMany({
      where: { slug: { in: slugs }, status: "scheduled" },
      data: { status: "draft", scheduledAt: null },
    });
    await logAudit({ actorId: admin.id, action: "blog.launch_batch_unscheduled", targetType: "BlogPost", targetId: "launch-batch", metadata: { count: res.count } });
    revalidatePath("/admin/blog");
    revalidatePath("/admin/blog/calendar");
    revalidatePath("/admin/blog/import");
    return { ok: true, message: `Moved ${res.count} scheduled post${res.count === 1 ? "" : "s"} back to draft.` };
  } catch (err) {
    logger.error({ err }, "launch batch unschedule failed");
    return { ok: false, error: "Couldn't unschedule the batch." };
  }
}
