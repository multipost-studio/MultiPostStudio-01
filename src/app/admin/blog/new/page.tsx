import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { BlogEditorClient } from "../blog-editor-client";

export const metadata: Metadata = { title: "Admin · New Blog Post" };

export default async function NewBlogPostPage() {
  const [categories, authors, availableTags] = await Promise.all([
    db.blogCategory.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    db.blogAuthor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.blogTag.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <BlogSubNav />
      <BlogEditorClient
        categories={categories}
        authors={authors}
        availableTags={availableTags}
      />
    </div>
  );
}
