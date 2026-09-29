import { db } from "@/lib/db";
import { logger } from "@/lib/logger";

export type BlogStatus = "draft" | "pending_review" | "scheduled" | "published" | "archived" | "deleted";

export type BlogPostListItem = {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  excerpt: string | null;
  status: string;
  featuredImage: string | null;
  readMins: number;
  publishedAt: Date | null;
  scheduledAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  views: number;
  shares: number;
  author: { id: string; name: string; avatar: string | null } | null;
  category: { id: string; name: string; slug: string } | null;
  tags: { tag: { id: string; name: string; slug: string } }[];
  _count?: { comments: number; revisions: number };
};

export type BlogFilterOptions = {
  q?: string;
  status?: string;
  categoryId?: string;
  authorId?: string;
  tagId?: string;
  sort?: "newest" | "oldest" | "updated" | "views" | "title" | "scheduled";
  page?: number;
  pageSize?: number;
  includeTrash?: boolean;
};

/**
 * Sluggify a string: lowercases, removes non-alphanumeric, joins with hyphens.
 */
export function sluggify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Generate a unique slug in the database.
 */
export async function generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
  let baseSlug = sluggify(title);
  if (!baseSlug) baseSlug = "post";

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await db.blogPost.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing || (excludeId && existing.id === excludeId)) {
      return slug;
    }

    counter++;
    slug = `${baseSlug}-${counter}`;
  }
}

/**
 * Query blog posts for admin list with filters, pagination, and sorting.
 */
export async function getBlogPostsAdmin(filters: BlogFilterOptions = {}) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(100, filters.pageSize ?? 15));
  const skip = (page - 1) * pageSize;

  const where: Record<string, unknown> = {};

  // Status and trash filtering
  if (filters.status === "trash") {
    where.deletedAt = { not: null };
  } else {
    where.deletedAt = null;
    if (filters.status && filters.status !== "all") {
      where.status = filters.status;
    }
  }

  // Category filter
  if (filters.categoryId && filters.categoryId !== "all") {
    where.categoryId = filters.categoryId;
  }

  // Author filter
  if (filters.authorId && filters.authorId !== "all") {
    where.authorId = filters.authorId;
  }

  // Tag filter
  if (filters.tagId && filters.tagId !== "all") {
    where.tags = { some: { tagId: filters.tagId } };
  }

  // Search query
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { title: { contains: q, mode: "insensitive" } },
      { subtitle: { contains: q, mode: "insensitive" } },
      { excerpt: { contains: q, mode: "insensitive" } },
      { slug: { contains: q, mode: "insensitive" } },
      { content: { contains: q, mode: "insensitive" } },
    ];
  }

  // Sorting
  let orderBy: Record<string, "asc" | "desc"> = { createdAt: "desc" };
  switch (filters.sort) {
    case "oldest":
      orderBy = { createdAt: "asc" };
      break;
    case "updated":
      orderBy = { updatedAt: "desc" };
      break;
    case "views":
      orderBy = { views: "desc" };
      break;
    case "title":
      orderBy = { title: "asc" };
      break;
    case "scheduled":
      orderBy = { scheduledAt: "asc" };
      break;
    default:
      orderBy = { createdAt: "desc" };
  }

  const total = await db.blogPost.count({ where });
  const items = await db.blogPost.findMany({
    where,
    orderBy,
    skip,
    take: pageSize,
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      category: { select: { id: true, name: true, slug: true } },
      tags: { include: { tag: { select: { id: true, name: true, slug: true } } } },
      _count: { select: { comments: true, revisions: true } },
    },
  });

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}

/**
 * Fetch a single blog post by ID with full details.
 */
export async function getBlogPostById(id: string) {
  return db.blogPost.findUnique({
    where: { id },
    include: {
      author: true,
      category: true,
      tags: { include: { tag: true } },
      revisions: {
        orderBy: { createdAt: "desc" },
        take: 30,
      },
      comments: {
        orderBy: { createdAt: "desc" },
        take: 50,
      },
    },
  });
}

/**
 * Fetch a single blog post by slug for preview or public view.
 */
export async function getBlogPostBySlug(slug: string) {
  return db.blogPost.findUnique({
    where: { slug },
    include: {
      author: true,
      category: true,
      tags: { include: { tag: true } },
    },
  });
}

/**
 * Fetch comprehensive blog dashboard metrics with minimal connection pool overhead.
 */
export async function getBlogDashboardMetrics() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  // 1. Single efficient query for all active posts metadata (replaces 10 individual queries)
  const activePosts = await db.blogPost.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      title: true,
      slug: true,
      status: true,
      views: true,
      shares: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { name: true } },
    },
    orderBy: { views: "desc" },
  });

  const totalPosts = activePosts.length;
  let published = 0;
  let drafts = 0;
  let scheduled = 0;
  let pendingReview = 0;
  let archived = 0;
  let totalViews = 0;
  let totalShares = 0;
  let postsThisMonth = 0;
  let postsThisWeek = 0;

  for (const p of activePosts) {
    if (p.status === "published") published++;
    else if (p.status === "draft") drafts++;
    else if (p.status === "scheduled") scheduled++;
    else if (p.status === "pending_review") pendingReview++;
    else if (p.status === "archived") archived++;

    totalViews += p.views || 0;
    totalShares += p.shares || 0;
    if (p.createdAt >= startOfMonth) postsThisMonth++;
    if (p.createdAt >= startOfWeek) postsThisWeek++;
  }

  const mostViewed = activePosts[0] || null;
  const recentPosts = [...activePosts]
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, 5);

  // 2. Trash count
  const trash = await db.blogPost.count({ where: { deletedAt: { not: null } } });

  // 3. Comments count (single query)
  const commentsGroup = await db.blogComment.groupBy({
    by: ["status"],
    _count: true,
  });
  let totalComments = 0;
  let pendingComments = 0;
  for (const c of commentsGroup) {
    totalComments += c._count;
    if (c.status === "pending") pendingComments = c._count;
  }

  // 4. Categories breakdown
  const categories = await db.blogCategory.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      _count: { select: { posts: { where: { deletedAt: null } } } },
    },
  });

  // Status breakdown for Donut chart
  const statusDistribution = [
    { label: "Published", value: published, key: "published" },
    { label: "Drafts", value: drafts, key: "drafts" },
    { label: "Scheduled", value: scheduled, key: "scheduled" },
    { label: "In Review", value: pendingReview, key: "pending_review" },
    { label: "Archived", value: archived, key: "archived" },
  ].filter((s) => s.value > 0);

  // Category breakdown
  const categoryPerformance = categories
    .map((c) => ({
      label: c.name,
      posts: c._count.posts,
    }))
    .filter((c) => c.posts > 0);

  return {
    kpis: {
      totalPosts,
      published,
      drafts,
      scheduled,
      pendingReview,
      archived,
      trash,
      totalViews,
      totalShares,
      totalComments,
      pendingComments,
      postsThisMonth,
      postsThisWeek,
      mostViewed,
    },
    statusDistribution,
    categoryPerformance,
    recentPosts,
  };
}

/**
 * Fetch 30-day publishing and view trends for analytics charts.
 */
export async function getBlogTimeSeriesAnalytics(days = 30) {
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);

  const posts = await db.blogPost.findMany({
    where: {
      publishedAt: { gte: start, lte: end },
      status: "published",
      deletedAt: null,
    },
    select: { publishedAt: true },
  });

  const views = await db.blogViewEvent.findMany({
    where: {
      viewedAt: { gte: start, lte: end },
    },
    select: { viewedAt: true },
  });

  // Daily bucket map
  const dailyMap = new Map<string, { published: number; views: number }>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(start.getTime() + i * 86_400_000);
    const key = d.toISOString().slice(5, 10); // MM-DD
    dailyMap.set(key, { published: 0, views: 0 });
  }

  for (const p of posts) {
    if (p.publishedAt) {
      const key = p.publishedAt.toISOString().slice(5, 10);
      const curr = dailyMap.get(key);
      if (curr) curr.published++;
    }
  }

  for (const v of views) {
    const key = v.viewedAt.toISOString().slice(5, 10);
    const curr = dailyMap.get(key);
    if (curr) curr.views++;
  }

  return Array.from(dailyMap.entries()).map(([label, data]) => ({
    label,
    published: data.published,
    views: data.views,
  }));
}

/**
 * SEO Score Calculation & Analysis Checklist.
 */
export type SeoCheckItem = {
  id: string;
  label: string;
  status: "pass" | "warn" | "fail";
  detail: string;
};

export function analyzeBlogSeo(input: {
  title?: string;
  seoTitle?: string;
  excerpt?: string;
  seoDescription?: string;
  slug?: string;
  content?: string;
  focusKeyword?: string;
  featuredImage?: string | null;
  featuredImageAlt?: string | null;
}) {
  const checks: SeoCheckItem[] = [];
  const title = (input.seoTitle || input.title || "").trim();
  const desc = (input.seoDescription || input.excerpt || "").trim();
  const keyword = (input.focusKeyword || "").trim().toLowerCase();
  const content = input.content || "";
  const slug = (input.slug || "").trim();

  // 1. Title Length Check (Optimal: 40-65 chars)
  if (!title) {
    checks.push({ id: "title_missing", label: "Page Title", status: "fail", detail: "Title is missing." });
  } else if (title.length < 35) {
    checks.push({ id: "title_short", label: "Title Length", status: "warn", detail: `${title.length}/60 chars (a bit short).` });
  } else if (title.length > 65) {
    checks.push({ id: "title_long", label: "Title Length", status: "warn", detail: `${title.length}/60 chars (may be truncated in SERPs).` });
  } else {
    checks.push({ id: "title_good", label: "Title Length", status: "pass", detail: `${title.length}/60 chars (optimal length).` });
  }

  // 2. Meta Description Length (Optimal: 120-160 chars)
  if (!desc) {
    checks.push({ id: "desc_missing", label: "Meta Description", status: "fail", detail: "Meta description is missing." });
  } else if (desc.length < 90) {
    checks.push({ id: "desc_short", label: "Meta Description Length", status: "warn", detail: `${desc.length}/155 chars (consider elaborating).` });
  } else if (desc.length > 165) {
    checks.push({ id: "desc_long", label: "Meta Description Length", status: "warn", detail: `${desc.length}/155 chars (may truncate on mobile).` });
  } else {
    checks.push({ id: "desc_good", label: "Meta Description Length", status: "pass", detail: `${desc.length}/155 chars (optimal length).` });
  }

  // 3. Focus Keyword Usage
  if (!keyword) {
    checks.push({ id: "keyword_none", label: "Focus Keyword", status: "warn", detail: "Add a focus keyword to evaluate search optimization." });
  } else {
    const inTitle = title.toLowerCase().includes(keyword);
    checks.push({
      id: "keyword_in_title",
      label: "Keyword in Title",
      status: inTitle ? "pass" : "warn",
      detail: inTitle ? `Found "${keyword}" in title.` : `Keyword "${keyword}" not found in title.`,
    });

    const inDesc = desc.toLowerCase().includes(keyword);
    checks.push({
      id: "keyword_in_desc",
      label: "Keyword in Meta Description",
      status: inDesc ? "pass" : "warn",
      detail: inDesc ? `Found "${keyword}" in meta description.` : `Keyword "${keyword}" not found in meta description.`,
    });

    const inSlug = slug.toLowerCase().includes(sluggify(keyword));
    checks.push({
      id: "keyword_in_slug",
      label: "Keyword in URL Slug",
      status: inSlug ? "pass" : "warn",
      detail: inSlug ? `Slug contains focus keyword.` : `Consider including keyword in URL slug.`,
    });

    // Keyword density in content
    const words = content.toLowerCase().match(/\b\w+\b/g) || [];
    const count = (content.toLowerCase().match(new RegExp(keyword, "g")) || []).length;
    const density = words.length > 0 ? (count / words.length) * 100 : 0;
    if (count === 0) {
      checks.push({ id: "keyword_in_content", label: "Keyword in Content", status: "fail", detail: `Focus keyword does not appear in the body.` });
    } else if (density > 3.5) {
      checks.push({ id: "keyword_stuffing", label: "Keyword Density", status: "warn", detail: `${density.toFixed(1)}% density (may trigger keyword-stuffing filters).` });
    } else {
      checks.push({ id: "keyword_density_good", label: "Keyword Density", status: "pass", detail: `${density.toFixed(1)}% density (${count} appearances).` });
    }
  }

  // 4. Content Word Count
  const wordCount = (content.match(/\b\w+\b/g) || []).length;
  if (wordCount < 150) {
    checks.push({ id: "content_very_short", label: "Content Length", status: "fail", detail: `${wordCount} words (too thin for search ranking).` });
  } else if (wordCount < 400) {
    checks.push({ id: "content_short", label: "Content Length", status: "warn", detail: `${wordCount} words (good start, 600+ recommended).` });
  } else {
    checks.push({ id: "content_good", label: "Content Length", status: "pass", detail: `${wordCount} words (comprehensive length).` });
  }

  // 5. Heading Structure
  const hasH2 = /^##\s+/m.test(content) || /<h2\b/i.test(content);
  checks.push({
    id: "headings",
    label: "Headings & Structure",
    status: hasH2 ? "pass" : "warn",
    detail: hasH2 ? "Content contains subheadings (H2/H3)." : "Add H2/H3 subheadings to structure your post.",
  });

  // 6. Featured Image & Alt Text
  if (!input.featuredImage) {
    checks.push({ id: "featured_image_missing", label: "Featured Image", status: "warn", detail: "Adding a featured image improves CTR on social & search." });
  } else if (!input.featuredImageAlt?.trim()) {
    checks.push({ id: "alt_text_missing", label: "Image Alt Text", status: "warn", detail: "Featured image is missing descriptive alt text." });
  } else {
    checks.push({ id: "featured_image_good", label: "Featured Image & Alt Text", status: "pass", detail: "Featured image with descriptive alt text present." });
  }

  // 7. Internal & External Links
  const internalLinks = (content.match(/\[.*?\]\(\/.*?\)/g) || []).length;
  const externalLinks = (content.match(/\[.*?\]\(https?:\/\/.*?\)/g) || []).length;
  checks.push({
    id: "links",
    label: "Links & References",
    status: internalLinks > 0 || externalLinks > 0 ? "pass" : "warn",
    detail: `${internalLinks} internal links, ${externalLinks} external links.`,
  });

  // Calculate score (0 to 100)
  const passCount = checks.filter((c) => c.status === "pass").length;
  const warnCount = checks.filter((c) => c.status === "warn").length;
  const score = Math.round(((passCount * 1.0 + warnCount * 0.5) / checks.length) * 100) || 0;

  return { score, checks, wordCount, estimatedReadMins: Math.max(1, Math.ceil(wordCount / 200)) };
}
