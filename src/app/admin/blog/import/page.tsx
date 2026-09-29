import type { Metadata } from "next";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { BlogImportClient } from "./import-client";

export const metadata: Metadata = { title: "Admin · Bulk Blog Import" };

export default async function AdminBlogImportPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Bulk Blog Import Wizard</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Import articles from CSV, JSON, Markdown, or WordPress exports with automatic column mapping.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <BlogImportClient />
    </div>
  );
}
