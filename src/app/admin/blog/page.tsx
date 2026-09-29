import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/session";
import { getBlogPostsAdmin, getBlogDashboardMetrics, type BlogFilterOptions } from "@/lib/blog";
import { db } from "@/lib/db";
import { BlogSubNav } from "./_components/blog-sub-nav";
import { BlogDashboardClient } from "./blog-dashboard-client";

export const metadata: Metadata = { title: "Admin · Blog CMS" };

export default async function AdminBlogPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    category?: string;
    author?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  await requirePlatformAdmin();

  const filters: BlogFilterOptions = {
    status: sp.status || "all",
    q: sp.q || "",
    categoryId: sp.category || "all",
    authorId: sp.author || "all",
    sort: (sp.sort as BlogFilterOptions["sort"]) || "newest",
    page: sp.page ? parseInt(sp.page, 10) : 1,
    pageSize: 15,
  };

  const postsData = await getBlogPostsAdmin(filters);
  const metrics = await getBlogDashboardMetrics();
  const categories = await db.blogCategory.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } });
  const authors = await db.blogAuthor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog / Content Management</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Create, schedule, organize, and publish marketing articles to multipoststudio.app/blog.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <BlogDashboardClient
        initialPosts={postsData.items}
        total={postsData.total}
        page={postsData.page}
        pageSize={postsData.pageSize}
        totalPages={postsData.totalPages}
        metrics={metrics}
        categories={categories}
        authors={authors}
        currentFilters={filters}
      />
    </div>
  );
}
