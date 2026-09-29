import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/lib/session";
import { db } from "@/lib/db";
import { BlogSubNav } from "../_components/blog-sub-nav";
import { BlogSettingsClient } from "./settings-client";

export const metadata: Metadata = { title: "Admin · Blog Settings" };

export default async function AdminBlogSettingsPage() {
  await requirePlatformAdmin();

  const [settingsRaw, authors] = await Promise.all([
    db.blogSetting.findMany(),
    db.blogAuthor.findMany({ orderBy: { name: "asc" } }),
  ]);

  const settings: Record<string, string> = {};
  for (const s of settingsRaw) {
    settings[s.key] = s.value;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text)]">Blog & Content Settings</h1>
          <p className="mt-1 text-[14px] text-[var(--text-muted)]">
            Configure global publishing preferences, RSS syndication, SEO defaults, and reader engagement rules.
          </p>
        </div>
      </div>

      <BlogSubNav />

      <BlogSettingsClient
        initialSettings={settings}
        authors={authors.map((a) => ({ id: a.id, name: a.name }))}
      />
    </div>
  );
}
