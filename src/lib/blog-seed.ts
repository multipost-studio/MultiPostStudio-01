import { db } from "@/lib/db";
import { BLOG_POSTS } from "@/app/(marketing)/_data";
import { logger } from "@/lib/logger";

export async function ensureBlogSeeded() {
  const existingCount = await db.blogPost.count();
  if (existingCount > 0) return;

  logger.info("Seeding initial Blog CMS data from existing content...");

  // 1. Create or get default author
  const author = await db.blogAuthor.upsert({
    where: { slug: "multipost-studio-team" },
    create: {
      name: "MultiPost Studio Team",
      slug: "multipost-studio-team",
      email: "team@multipoststudio.app",
      role: "Editorial Team",
      bio: "The engineering, design, and marketing team behind MultiPost Studio.",
      socialLinks: JSON.stringify({ twitter: "https://x.com/multipoststudio", linkedin: "https://linkedin.com/company/multipoststudio" }),
    },
    update: {},
  });

  // 2. Create default categories
  const categoriesData = [
    { name: "Strategy", slug: "strategy", description: "Content strategies, publishing cadences, and audience building." },
    { name: "AI & Automation", slug: "ai", description: "Using generative AI while keeping your authentic brand voice." },
    { name: "Workflow & Teams", slug: "workflow", description: "Approval chains, team governance, and client workflows." },
    { name: "Analytics & ROI", slug: "analytics", description: "Metrics that matter, conversion tracking, and reporting." },
    { name: "Product & Releases", slug: "product", description: "New features, changelog highlights, and platform updates." },
  ];

  const catMap = new Map<string, string>();
  for (const c of categoriesData) {
    const row = await db.blogCategory.upsert({
      where: { slug: c.slug },
      create: { name: c.name, slug: c.slug, description: c.description },
      update: {},
    });
    catMap.set(c.slug, row.id);
  }

  // 3. Create default tags
  const tagsData = ["Strategy", "AI", "Workflow", "Analytics", "Social Media", "Productivity"];
  const tagMap = new Map<string, string>();
  for (const t of tagsData) {
    const slug = t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const row = await db.blogTag.upsert({
      where: { slug },
      create: { name: t, slug, description: `${t} insights and best practices` },
      update: {},
    });
    tagMap.set(t.toLowerCase(), row.id);
  }

  // 4. Seed initial posts from BLOG_POSTS
  for (const p of BLOG_POSTS) {
    const catSlug = p.tag?.toLowerCase() || "strategy";
    const categoryId = catMap.get(catSlug) || catMap.get("strategy");
    const content = Array.isArray(p.body) ? p.body.join("\n\n") : String(p.body);
    const post = await db.blogPost.create({
      data: {
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        content,
        status: "published",
        readMins: p.readMins || 5,
        publishedAt: new Date(p.date),
        authorId: author.id,
        categoryId: categoryId || null,
        seoTitle: `${p.title} | MultiPost Studio Blog`,
        seoDescription: p.excerpt,
        focusKeyword: p.tag || "Social Media",
        views: Math.floor(Math.random() * 40) + 10,
        shares: Math.floor(Math.random() * 8) + 1,
      },
    });

    const tagId = tagMap.get((p.tag || "").toLowerCase());
    if (tagId) {
      await db.blogPostTag.create({
        data: {
          postId: post.id,
          tagId,
        },
      }).catch(() => {});
    }
  }

  // 5. Default Blog Settings
  const defaultSettings: [string, string][] = [
    ["site_title", "MultiPost Studio Blog"],
    ["site_description", "Practical writing on social media scheduling, brand voice, approvals, and analytics."],
    ["posts_per_page", "10"],
    ["comments_enabled", "true"],
    ["comments_require_approval", "true"],
    ["rss_enabled", "true"],
    ["default_author_id", author.id],
  ];

  for (const [k, v] of defaultSettings) {
    await db.blogSetting.upsert({
      where: { key: k },
      create: { key: k, value: v },
      update: {},
    });
  }

  logger.info("Blog CMS successfully seeded with default categories, author, and posts.");
}
