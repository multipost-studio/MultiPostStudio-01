import type { Metadata } from "next";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { BlogEditorClient } from "../blog-editor-client";

export const metadata: Metadata = { title: "Admin · New Blog Post" };
export const dynamic = "force-dynamic";

export default async function NewBlogPostPage() {
  let categories: any[] = [];
  let authors: any[] = [];
  let availableTags: any[] = [];

  try {
    const res = await Promise.all([
      db.blogCategory.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
      db.blogAuthor.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      db.blogTag.findMany({ select: { id: true, name: true, slug: true }, orderBy: { name: "asc" } }),
    ]);
    categories = res[0];
    authors = res[1];
    availableTags = res[2];
  } catch (err) {
    console.error("Failed to load blog form data:", err);
  }

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
