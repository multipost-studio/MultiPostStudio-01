import { requireAdminPermission } from "@/lib/session";
import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { CategoriesClient } from "./categories-client";

export const metadata: Metadata = { title: "Admin · Blog Categories" };
export const dynamic = "force-dynamic";

export default async function AdminBlogCategoriesPage() {
  await requireAdminPermission("content.view");
  let categories: any[] = [];
  try {
    categories = await db.blogCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        parent: { select: { id: true, name: true } },
        _count: { select: { posts: { where: { deletedAt: null } } } },
      },
    });
  } catch (err) {
    console.error("Failed to load blog categories:", err);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog Categories</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Organize articles into hierarchical topics for navigation, SEO, and content grouping.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <CategoriesClient initialCategories={categories} />
    </div>
  );
}
