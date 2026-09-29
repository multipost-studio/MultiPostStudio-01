"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/session";
import { logAudit } from "@/lib/events";
import { createAdminNotification } from "@/lib/admin-notifications";
import { generateUniqueSlug, sluggify, analyzeBlogSeo } from "@/lib/blog";
import { logger } from "@/lib/logger";

const postSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1, "Title is required").max(300),
  slug: z.string().max(300).optional(),
  subtitle: z.string().max(500).optional().nullable(),
  excerpt: z.string().max(1000).optional().nullable(),
  content: z.string().min(1, "Content is required"),
  status: z.enum(["draft", "pending_review", "scheduled", "published", "archived", "deleted"]).default("draft"),
  featuredImage: z.string().optional().nullable(),
  featuredImageAlt: z.string().max(300).optional().nullable(),
  featuredImageCaption: z.string().max(500).optional().nullable(),
  authorId: z.string().optional().nullable(),
  categoryId: z.string().optional().nullable(),
  readMins: z.number().int().min(1).default(3),
  publishedAt: z.string().optional().nullable(),
  scheduledAt: z.string().optional().nullable(),
  seoTitle: z.string().max(300).optional().nullable(),
  seoDescription: z.string().max(500).optional().nullable(),
  focusKeyword: z.string().max(100).optional().nullable(),
  secondaryKeywords: z.string().max(300).optional().nullable(),
  canonicalUrl: z.string().url().or(z.literal("")).optional().nullable(),
  robotsDirectives: z.string().max(100).default("index, follow").optional().nullable(),
  ogTitle: z.string().max(300).optional().nullable(),
  ogDescription: z.string().max(500).optional().nullable(),
  ogImage: z.string().optional().nullable(),
  twitterTitle: z.string().max(300).optional().nullable(),
  twitterDescription: z.string().max(500).optional().nullable(),
  twitterImage: z.string().optional().nullable(),
  allowComments: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  tagIds: z.array(z.string()).default([]),
  revisionSummary: z.string().max(200).optional(),
});

export type PostInput = z.infer<typeof postSchema>;

/**
 * Upsert a Blog Post (Create or Full Edit).
 */
export async function upsertBlogPostAction(raw: PostInput) {
  const admin = await requirePlatformAdmin();
  const parsed = postSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message || "Invalid input" };
  }

  const data = parsed.data;
  const isNew = !data.id;

  // Generate unique slug
  let slug = (data.slug?.trim() ? sluggify(data.slug) : sluggify(data.title)) || "post";
  slug = await generateUniqueSlug(slug, data.id);

  // Parse dates
  let publishedAt: Date | null = null;
  if (data.status === "published") {
    publishedAt = data.publishedAt ? new Date(data.publishedAt) : new Date();
  }
  const scheduledAt = data.scheduledAt ? new Date(data.scheduledAt) : null;

  try {
    let post;

    if (isNew) {
      post = await db.blogPost.create({
        data: {
          title: data.title,
          slug,
          subtitle: data.subtitle,
          excerpt: data.excerpt,
          content: data.content,
          status: data.status,
          featuredImage: data.featuredImage,
          featuredImageAlt: data.featuredImageAlt,
          featuredImageCaption: data.featuredImageCaption,
          authorId: data.authorId || null,
          categoryId: data.categoryId || null,
          readMins: data.readMins,
          publishedAt,
          scheduledAt,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          focusKeyword: data.focusKeyword,
          secondaryKeywords: data.secondaryKeywords,
          canonicalUrl: data.canonicalUrl || null,
          robotsDirectives: data.robotsDirectives || "index, follow",
          ogTitle: data.ogTitle,
          ogDescription: data.ogDescription,
          ogImage: data.ogImage,
          twitterTitle: data.twitterTitle,
          twitterDescription: data.twitterDescription,
          twitterImage: data.twitterImage,
          allowComments: data.allowComments,
          isFeatured: data.isFeatured,
          tags: {
            create: data.tagIds.map((tagId) => ({ tagId })),
          },
          revisions: {
            create: {
              title: data.title,
              content: data.content,
              excerpt: data.excerpt,
              authorName: admin.name,
              summary: "Initial creation",
            },
          },
        },
      });

      await logAudit({
        action: "blog.post_created",
        targetType: "BlogPost",
        targetId: post.id,
        metadata: { title: post.title, slug: post.slug, status: post.status },
      });
    } else {
      const existing = await db.blogPost.findUnique({
        where: { id: data.id },
        select: { slug: true, status: true, title: true },
      });

      if (!existing) {
        return { ok: false, error: "Post not found" };
      }

      // If published post changed slug, add automatic 301 redirect
      if (existing.slug !== slug && existing.status === "published") {
        await db.blogRedirect.upsert({
          where: { fromSlug: existing.slug },
          create: { fromSlug: existing.slug, toSlug: slug },
          update: { toSlug: slug },
        }).catch(() => {});
      }

      post = await db.blogPost.update({
        where: { id: data.id },
        data: {
          title: data.title,
          slug,
          subtitle: data.subtitle,
          excerpt: data.excerpt,
          content: data.content,
          status: data.status,
          featuredImage: data.featuredImage,
          featuredImageAlt: data.featuredImageAlt,
          featuredImageCaption: data.featuredImageCaption,
          authorId: data.authorId || null,
          categoryId: data.categoryId || null,
          readMins: data.readMins,
          publishedAt,
          scheduledAt,
          seoTitle: data.seoTitle,
          seoDescription: data.seoDescription,
          focusKeyword: data.focusKeyword,
          secondaryKeywords: data.secondaryKeywords,
          canonicalUrl: data.canonicalUrl || null,
          robotsDirectives: data.robotsDirectives || "index, follow",
          ogTitle: data.ogTitle,
          ogDescription: data.ogDescription,
          ogImage: data.ogImage,
          twitterTitle: data.twitterTitle,
          twitterDescription: data.twitterDescription,
          twitterImage: data.twitterImage,
          allowComments: data.allowComments,
          isFeatured: data.isFeatured,
          tags: {
            deleteMany: {},
            create: data.tagIds.map((tagId) => ({ tagId })),
          },
          revisions: {
            create: {
              title: data.title,
              content: data.content,
              excerpt: data.excerpt,
              authorName: admin.name,
              summary: data.revisionSummary || "Saved updates",
            },
          },
        },
      });

      await logAudit({
        action: "blog.post_updated",
        targetType: "BlogPost",
        targetId: post.id,
        metadata: { title: post.title, slug: post.slug, status: post.status },
      });
    }

    if (post.status === "published") {
      await createAdminNotification({
        type: "blog_published",
        priority: "info",
        title: `Blog Post: ${post.title}`,
        body: `Post "${post.title}" is now published on the marketing blog.`,
        linkUrl: `/admin/blog/${post.id}`,
      }).catch(() => {});
    }

    revalidatePath("/admin/blog");
    revalidatePath(`/admin/blog/${post.id}`);
    revalidatePath("/blog");
    revalidatePath(`/blog/${post.slug}`);
    revalidatePath("/sitemap.xml");

    return { ok: true, post };
  } catch (err: unknown) {
    logger.error({ err }, "upsertBlogPostAction failed");
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save post" };
  }
}

/**
 * Fast Autosave Action for editor debouncing.
 */
export async function autosaveBlogPostAction(input: {
  id?: string;
  title: string;
  content: string;
  subtitle?: string | null;
  excerpt?: string | null;
}) {
  const admin = await requirePlatformAdmin();
  if (!input.title?.trim() && !input.content?.trim()) {
    return { ok: false, error: "Empty content" };
  }

  const title = input.title?.trim() || "Untitled Draft";

  try {
    if (!input.id) {
      const slug = await generateUniqueSlug(title);
      const post = await db.blogPost.create({
        data: {
          title,
          slug,
          content: input.content || "",
          subtitle: input.subtitle,
          excerpt: input.excerpt,
          status: "draft",
        },
      });
      return { ok: true, id: post.id, slug: post.slug, savedAt: new Date().toISOString() };
    } else {
      await db.blogPost.update({
        where: { id: input.id },
        data: {
          title,
          content: input.content || "",
          subtitle: input.subtitle,
          excerpt: input.excerpt,
          updatedAt: new Date(),
        },
      });
      return { ok: true, id: input.id, savedAt: new Date().toISOString() };
    }
  } catch (err) {
    logger.warn({ err }, "Autosave failed");
    return { ok: false, error: "Autosave failed" };
  }
}

/**
 * Status Change Action (Publish, Schedule, Unpublish, Archive, Trash).
 */
export async function setBlogPostStatusAction(input: {
  id: string;
  status: "draft" | "pending_review" | "scheduled" | "published" | "archived" | "deleted";
  scheduledAt?: string | null;
}) {
  await requirePlatformAdmin();
  const existing = await db.blogPost.findUnique({ where: { id: input.id } });
  if (!existing) return { ok: false, error: "Post not found" };

  const updateData: Record<string, unknown> = { status: input.status };

  if (input.status === "published") {
    updateData.publishedAt = existing.publishedAt || new Date();
    updateData.deletedAt = null;
  } else if (input.status === "scheduled") {
    if (!input.scheduledAt) return { ok: false, error: "Scheduled date is required" };
    const date = new Date(input.scheduledAt);
    if (isNaN(date.getTime()) || date <= new Date()) {
      return { ok: false, error: "Scheduled time must be in the future" };
    }
    updateData.scheduledAt = date;
    updateData.deletedAt = null;
  } else if (input.status === "deleted") {
    updateData.deletedAt = new Date();
  }

  const post = await db.blogPost.update({
    where: { id: input.id },
    data: updateData,
  });

  await logAudit({
    action: `blog.status_${input.status}`,
    targetType: "BlogPost",
    targetId: post.id,
    metadata: { title: post.title, oldStatus: existing.status, newStatus: input.status },
  });

  revalidatePath("/admin/blog");
  revalidatePath(`/admin/blog/${post.id}`);
  revalidatePath("/blog");
  revalidatePath(`/blog/${post.slug}`);
  revalidatePath("/sitemap.xml");

  return { ok: true, post };
}

/**
 * Duplicate a post.
 */
export async function duplicateBlogPostAction(id: string) {
  const admin = await requirePlatformAdmin();
  const original = await db.blogPost.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!original) return { ok: false, error: "Post not found" };

  const title = `${original.title} (Copy)`;
  const slug = await generateUniqueSlug(title);

  const clone = await db.blogPost.create({
    data: {
      title,
      slug,
      subtitle: original.subtitle,
      excerpt: original.excerpt,
      content: original.content,
      status: "draft",
      featuredImage: original.featuredImage,
      featuredImageAlt: original.featuredImageAlt,
      featuredImageCaption: original.featuredImageCaption,
      authorId: original.authorId,
      categoryId: original.categoryId,
      readMins: original.readMins,
      seoTitle: original.seoTitle,
      seoDescription: original.seoDescription,
      focusKeyword: original.focusKeyword,
      secondaryKeywords: original.secondaryKeywords,
      canonicalUrl: null,
      allowComments: original.allowComments,
      tags: {
        create: original.tags.map((t) => ({ tagId: t.tagId })),
      },
      revisions: {
        create: {
          title,
          content: original.content,
          excerpt: original.excerpt,
          authorName: admin.name,
          summary: `Duplicated from "${original.title}"`,
        },
      },
    },
  });

  await logAudit({
    action: "blog.post_duplicated",
    targetType: "BlogPost",
    targetId: clone.id,
    metadata: { sourceId: original.id, newTitle: clone.title },
  });

  revalidatePath("/admin/blog");
  return { ok: true, post: clone };
}

/**
 * Soft delete or permanent delete.
 */
export async function deleteBlogPostAction(id: string, permanent = false) {
  await requirePlatformAdmin();
  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) return { ok: false, error: "Post not found" };

  if (permanent) {
    await db.blogPost.delete({ where: { id } });
    await logAudit({
      action: "blog.post_permanently_deleted",
      targetType: "BlogPost",
      targetId: id,
      metadata: { title: post.title, slug: post.slug },
    });
  } else {
    await db.blogPost.update({
      where: { id },
      data: { deletedAt: new Date(), status: "deleted" },
    });
    await logAudit({
      action: "blog.post_trashed",
      targetType: "BlogPost",
      targetId: id,
      metadata: { title: post.title, slug: post.slug },
    });
  }

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");

  return { ok: true };
}

/**
 * Restore a soft-deleted post from trash.
 */
export async function restoreBlogPostAction(id: string) {
  await requirePlatformAdmin();
  const post = await db.blogPost.findUnique({ where: { id } });
  if (!post) return { ok: false, error: "Post not found" };

  await db.blogPost.update({
    where: { id },
    data: { deletedAt: null, status: "draft" },
  });

  await logAudit({
    action: "blog.post_restored",
    targetType: "BlogPost",
    targetId: id,
    metadata: { title: post.title },
  });

  revalidatePath("/admin/blog");
  return { ok: true };
}

/**
 * Bulk Actions on Blog Posts.
 */
export async function bulkBlogPostAction(input: {
  ids: string[];
  action: "publish" | "unpublish" | "archive" | "trash" | "restore" | "delete" | "set_category" | "add_tag";
  payload?: string;
}) {
  await requirePlatformAdmin();
  const { ids, action, payload } = input;
  if (!ids.length) return { ok: false, error: "No posts selected" };

  try {
    switch (action) {
      case "publish":
        await db.blogPost.updateMany({
          where: { id: { in: ids } },
          data: { status: "published", publishedAt: new Date(), deletedAt: null },
        });
        break;
      case "unpublish":
        await db.blogPost.updateMany({
          where: { id: { in: ids } },
          data: { status: "draft" },
        });
        break;
      case "archive":
        await db.blogPost.updateMany({
          where: { id: { in: ids } },
          data: { status: "archived" },
        });
        break;
      case "trash":
        await db.blogPost.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: new Date(), status: "deleted" },
        });
        break;
      case "restore":
        await db.blogPost.updateMany({
          where: { id: { in: ids } },
          data: { deletedAt: null, status: "draft" },
        });
        break;
      case "delete":
        await db.blogPost.deleteMany({
          where: { id: { in: ids } },
        });
        break;
      case "set_category":
        if (!payload) return { ok: false, error: "Category ID required" };
        await db.blogPost.updateMany({
          where: { id: { in: ids } },
          data: { categoryId: payload },
        });
        break;
      case "add_tag":
        if (!payload) return { ok: false, error: "Tag ID required" };
        for (const id of ids) {
          await db.blogPostTag.upsert({
            where: { postId_tagId: { postId: id, tagId: payload } },
            create: { postId: id, tagId: payload },
            update: {},
          }).catch(() => {});
        }
        break;
    }

    await logAudit({
      action: `blog.bulk_${action}`,
      targetType: "BlogPost",
      targetId: "bulk",
      metadata: { count: ids.length, ids, payload },
    });

    revalidatePath("/admin/blog");
    revalidatePath("/blog");
    revalidatePath("/sitemap.xml");

    return { ok: true, count: ids.length };
  } catch (err) {
    logger.error({ err }, "bulkBlogPostAction failed");
    return { ok: false, error: "Bulk operation failed" };
  }
}

/**
 * Restore a revision.
 */
export async function restoreBlogPostRevisionAction(postId: string, revisionId: string) {
  const admin = await requirePlatformAdmin();
  const revision = await db.blogPostRevision.findUnique({
    where: { id: revisionId },
  });
  if (!revision || revision.postId !== postId) {
    return { ok: false, error: "Revision not found" };
  }

  const post = await db.blogPost.update({
    where: { id: postId },
    data: {
      title: revision.title,
      content: revision.content,
      excerpt: revision.excerpt,
      revisions: {
        create: {
          title: revision.title,
          content: revision.content,
          excerpt: revision.excerpt,
          authorName: admin.name,
          summary: `Restored version from ${new Date(revision.createdAt).toLocaleString()}`,
        },
      },
    },
  });

  await logAudit({
    action: "blog.revision_restored",
    targetType: "BlogPost",
    targetId: postId,
    metadata: { revisionId, restoredTitle: revision.title },
  });

  revalidatePath(`/admin/blog/${postId}`);
  return { ok: true, post };
}

/* ---------------- Categories Management ---------------- */

export async function upsertBlogCategoryAction(input: {
  id?: string;
  name: string;
  slug?: string;
  description?: string;
  parentId?: string | null;
  featuredImage?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  sortOrder?: number;
}) {
  await requirePlatformAdmin();
  const slug = (input.slug?.trim() ? sluggify(input.slug) : sluggify(input.name)) || "category";

  if (!input.name?.trim()) return { ok: false, error: "Name is required" };

  try {
    if (input.id) {
      const cat = await db.blogCategory.update({
        where: { id: input.id },
        data: {
          name: input.name.trim(),
          slug,
          description: input.description?.trim() || null,
          parentId: input.parentId || null,
          featuredImage: input.featuredImage || null,
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      revalidatePath("/admin/blog/categories");
      return { ok: true, category: cat };
    } else {
      const cat = await db.blogCategory.create({
        data: {
          name: input.name.trim(),
          slug,
          description: input.description?.trim() || null,
          parentId: input.parentId || null,
          featuredImage: input.featuredImage || null,
          seoTitle: input.seoTitle || null,
          seoDescription: input.seoDescription || null,
          sortOrder: input.sortOrder ?? 0,
        },
      });
      revalidatePath("/admin/blog/categories");
      return { ok: true, category: cat };
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save category" };
  }
}

export async function deleteBlogCategoryAction(id: string) {
  await requirePlatformAdmin();
  await db.blogPost.updateMany({ where: { categoryId: id }, data: { categoryId: null } });
  await db.blogCategory.delete({ where: { id } });
  revalidatePath("/admin/blog/categories");
  return { ok: true };
}

/* ---------------- Tags Management ---------------- */

export async function upsertBlogTagAction(input: { id?: string; name: string; slug?: string; description?: string }) {
  await requirePlatformAdmin();
  if (!input.name?.trim()) return { ok: false, error: "Name is required" };
  const slug = (input.slug?.trim() ? sluggify(input.slug) : sluggify(input.name)) || "tag";

  try {
    if (input.id) {
      const tag = await db.blogTag.update({
        where: { id: input.id },
        data: { name: input.name.trim(), slug, description: input.description?.trim() || null },
      });
      revalidatePath("/admin/blog/tags");
      return { ok: true, tag };
    } else {
      const tag = await db.blogTag.create({
        data: { name: input.name.trim(), slug, description: input.description?.trim() || null },
      });
      revalidatePath("/admin/blog/tags");
      return { ok: true, tag };
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save tag" };
  }
}

export async function deleteBlogTagAction(id: string) {
  await requirePlatformAdmin();
  await db.blogTag.delete({ where: { id } });
  revalidatePath("/admin/blog/tags");
  return { ok: true };
}

export async function mergeBlogTagsAction(sourceTagId: string, targetTagId: string) {
  await requirePlatformAdmin();
  if (sourceTagId === targetTagId) return { ok: false, error: "Cannot merge a tag into itself" };

  // Re-associate all post tags
  const relations = await db.blogPostTag.findMany({ where: { tagId: sourceTagId } });
  for (const r of relations) {
    await db.blogPostTag.upsert({
      where: { postId_tagId: { postId: r.postId, tagId: targetTagId } },
      create: { postId: r.postId, tagId: targetTagId },
      update: {},
    }).catch(() => {});
  }

  // Delete source tag
  await db.blogTag.delete({ where: { id: sourceTagId } });
  revalidatePath("/admin/blog/tags");
  return { ok: true };
}

/* ---------------- Authors Management ---------------- */

export async function upsertBlogAuthorAction(input: {
  id?: string;
  name: string;
  slug?: string;
  email?: string | null;
  avatar?: string | null;
  bio?: string | null;
  role?: string | null;
  socialLinks?: string | null;
  userId?: string | null;
}) {
  await requirePlatformAdmin();
  if (!input.name?.trim()) return { ok: false, error: "Name is required" };
  const slug = (input.slug?.trim() ? sluggify(input.slug) : sluggify(input.name)) || "author";

  try {
    if (input.id) {
      const author = await db.blogAuthor.update({
        where: { id: input.id },
        data: {
          name: input.name.trim(),
          slug,
          email: input.email?.trim() || null,
          avatar: input.avatar || null,
          bio: input.bio || null,
          role: input.role || "Author",
          socialLinks: input.socialLinks || null,
          userId: input.userId || null,
        },
      });
      revalidatePath("/admin/blog/authors");
      return { ok: true, author };
    } else {
      const author = await db.blogAuthor.create({
        data: {
          name: input.name.trim(),
          slug,
          email: input.email?.trim() || null,
          avatar: input.avatar || null,
          bio: input.bio || null,
          role: input.role || "Author",
          socialLinks: input.socialLinks || null,
          userId: input.userId || null,
        },
      });
      revalidatePath("/admin/blog/authors");
      return { ok: true, author };
    }
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save author" };
  }
}

export async function deleteBlogAuthorAction(id: string) {
  await requirePlatformAdmin();
  await db.blogPost.updateMany({ where: { authorId: id }, data: { authorId: null } });
  await db.blogAuthor.delete({ where: { id } });
  revalidatePath("/admin/blog/authors");
  return { ok: true };
}

/* ---------------- Comments Moderation ---------------- */

export async function moderateBlogCommentAction(id: string, status: "approved" | "pending" | "spam" | "rejected" | "deleted") {
  await requirePlatformAdmin();
  if (status === "deleted") {
    await db.blogComment.delete({ where: { id } });
  } else {
    await db.blogComment.update({
      where: { id },
      data: { status },
    });
  }
  revalidatePath("/admin/blog/comments");
  return { ok: true };
}

export async function bulkModerateCommentsAction(ids: string[], status: "approved" | "spam" | "rejected" | "deleted") {
  await requirePlatformAdmin();
  if (!ids.length) return { ok: false, error: "No comments selected" };

  if (status === "deleted") {
    await db.blogComment.deleteMany({ where: { id: { in: ids } } });
  } else {
    await db.blogComment.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
  }

  revalidatePath("/admin/blog/comments");
  return { ok: true, count: ids.length };
}

/* ---------------- Blog Settings ---------------- */

export async function updateBlogSettingsAction(settings: Record<string, string>) {
  await requirePlatformAdmin();
  for (const [key, value] of Object.entries(settings)) {
    await db.blogSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });
  }
  revalidatePath("/admin/blog/settings");
  revalidatePath("/blog");
  return { ok: true };
}

/* ---------------- AI Content Assistance ---------------- */

export async function aiBlogAssistAction(input: {
  mode: "outline" | "title_ideas" | "meta_description" | "excerpt" | "polish_paragraph" | "suggest_tags";
  topic?: string;
  content?: string;
  title?: string;
}) {
  await requirePlatformAdmin();
  const { mode, topic, content, title } = input;

  // Fallback intelligent generators
  switch (mode) {
    case "outline": {
      const t = topic || title || "Social Media Strategy";
      return {
        ok: true,
        result: `## Introduction
- The current landscape of ${t}
- Why traditional approaches fail to scale
- The core thesis

## 1. Key Principles & Foundations
- Fundamental pillars that drive engagement
- Building consistency over sporadic virality
- Setting up actionable benchmarks

## 2. Step-by-Step Implementation Framework
- Phase 1: Planning and batch-creation
- Phase 2: Workflow governance and approval chains
- Phase 3: Automated distribution and queue management

## 3. Measuring Impact & Continuous Optimization
- Metric indicators that actually predict ROI
- Avoiding vanity metrics
- Adapting to algorithm shifts

## Conclusion & Actionable Takeaways
- Immediate steps your team can execute today
- Suggested reading and companion resources`,
      };
    }
    case "title_ideas": {
      const t = topic || title || "Content Strategy";
      return {
        ok: true,
        result: [
          `The No-Fluff Guide to ${t} in 2026`,
          `How Top Teams Scale Their ${t} Without Burnout`,
          `Why Your ${t} Isn't Working (And 4 Fixes That Do)`,
          `From Chaos to Cadence: A Playbook for ${t}`,
          `${t}: What the Top 1% of Brands Do Differently`,
        ],
      };
    }
    case "meta_description": {
      const body = (content || topic || "").slice(0, 300).replace(/\n/g, " ");
      const generated = `Discover how to streamline ${title || topic || "your social workflow"}. Practical takeaways on building consistency, approvals, and metrics that matter.`;
      return { ok: true, result: generated.slice(0, 155) };
    }
    case "excerpt": {
      const firstPara = (content || "").split("\n\n")[0] || "";
      const cleaned = firstPara.replace(/[#*`_\[\]]/g, "").trim();
      return {
        ok: true,
        result: cleaned.slice(0, 220) || `Practical strategies and insights on ${title || "social media management"} from the MultiPost Studio team.`,
      };
    }
    case "polish_paragraph": {
      return {
        ok: true,
        result: (content || "").trim(),
      };
    }
    case "suggest_tags": {
      return {
        ok: true,
        result: ["Strategy", "Social Media", "Productivity", "Workflow", "Analytics"],
      };
    }
  }
}

/* ---------------- Bulk Import ---------------- */

export type ImportRecord = {
  title: string;
  slug?: string;
  excerpt?: string;
  content: string;
  category?: string;
  author?: string;
  tags?: string[];
  status?: string;
  publishedAt?: string;
};

export async function executeBlogImportAction(records: ImportRecord[]) {
  const admin = await requirePlatformAdmin();
  if (!records.length) return { ok: false, error: "No records to import" };

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const errors: { row: number; title: string; reason: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r.title?.trim() || !r.content?.trim()) {
      failed++;
      errors.push({ row: i + 1, title: r.title || "Unknown", reason: "Missing title or content" });
      continue;
    }

    try {
      const slug = await generateUniqueSlug(r.slug || r.title);

      // Resolve category
      let categoryId: string | null = null;
      if (r.category?.trim()) {
        const catSlug = sluggify(r.category);
        const cat = await db.blogCategory.upsert({
          where: { slug: catSlug },
          create: { name: r.category.trim(), slug: catSlug },
          update: {},
        });
        categoryId = cat.id;
      }

      // Resolve author
      let authorId: string | null = null;
      if (r.author?.trim()) {
        const authSlug = sluggify(r.author);
        const auth = await db.blogAuthor.upsert({
          where: { slug: authSlug },
          create: { name: r.author.trim(), slug: authSlug },
          update: {},
        });
        authorId = auth.id;
      }

      const post = await db.blogPost.create({
        data: {
          title: r.title.trim(),
          slug,
          excerpt: r.excerpt?.trim() || null,
          content: r.content,
          status: r.status === "published" ? "published" : "draft",
          categoryId,
          authorId,
          publishedAt: r.status === "published" ? (r.publishedAt ? new Date(r.publishedAt) : new Date()) : null,
          revisions: {
            create: {
              title: r.title.trim(),
              content: r.content,
              excerpt: r.excerpt?.trim() || null,
              authorName: admin.name,
              summary: "Bulk import",
            },
          },
        },
      });

      // Handle tags
      if (r.tags && Array.isArray(r.tags)) {
        for (const t of r.tags) {
          if (!t?.trim()) continue;
          const tagSlug = sluggify(t);
          const tag = await db.blogTag.upsert({
            where: { slug: tagSlug },
            create: { name: t.trim(), slug: tagSlug },
            update: {},
          });
          await db.blogPostTag.create({
            data: { postId: post.id, tagId: tag.id },
          }).catch(() => {});
        }
      }

      imported++;
    } catch (err: unknown) {
      failed++;
      errors.push({ row: i + 1, title: r.title, reason: err instanceof Error ? err.message : "Database error" });
    }
  }

  await logAudit({
    action: "blog.bulk_import",
    targetType: "BlogPost",
    targetId: "bulk",
    metadata: { total: records.length, imported, skipped, failed },
  });

  revalidatePath("/admin/blog");
  revalidatePath("/blog");
  revalidatePath("/sitemap.xml");

  return { ok: true, summary: { imported, skipped, failed, errors } };
}

/* ---------------- Media Upload ---------------- */

export async function uploadBlogMediaAction(formData: FormData) {
  await requirePlatformAdmin();
  const file = formData.get("file") as File | null;
  if (!file) return { ok: false, error: "No file provided" };

  try {
    const { saveUpload } = await import("@/lib/adapters/storage");
    const saved = await saveUpload(file);
    return { ok: true, file: saved };
  } catch (err: unknown) {
    logger.error({ err }, "uploadBlogMediaAction failed");
    return { ok: false, error: err instanceof Error ? err.message : "Upload failed" };
  }
}

