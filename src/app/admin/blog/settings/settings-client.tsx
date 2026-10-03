"use client";

import { useState } from "react";
import { updateBlogSettingsAction } from "@/app/actions/blog";
import { Save, Check, Globe, MessageSquare, Rss, ShieldCheck } from "lucide-react";

type Props = {
  initialSettings: Record<string, string>;
  authors: { id: string; name: string }[];
};

export function BlogSettingsClient({ initialSettings, authors }: Props) {
  const [form, setForm] = useState({
    blog_title: initialSettings.blog_title || "MultiPost Studio Blog",
    blog_description:
      initialSettings.blog_description ||
      "Insights, product updates, and growth strategies for modern marketing teams.",
    posts_per_page: initialSettings.posts_per_page || "12",
    default_author_id: initialSettings.default_author_id || "",
    comments_enabled: initialSettings.comments_enabled ?? "true",
    comments_auto_approve: initialSettings.comments_auto_approve ?? "false",
    rss_enabled: initialSettings.rss_enabled ?? "true",
    reading_time_enabled: initialSettings.reading_time_enabled ?? "true",
    social_share_enabled: initialSettings.social_share_enabled ?? "true",
    default_og_image: initialSettings.default_og_image || "",
    canonical_base_url: initialSettings.canonical_base_url || "https://multipost.studio",
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    try {
      const res = await updateBlogSettingsAction(form);
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError("Failed to save settings");
      }
    } catch {
      setError("An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--success,#10b981)]/30 bg-[var(--success,#10b981)]/10 p-3 text-sm text-[var(--success,#10b981)]">
          <Check className="h-4 w-4 shrink-0" />
          <span>Blog settings saved and cache invalidated successfully.</span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-[var(--destructive,#ef4444)]/30 bg-[var(--destructive,#ef4444)]/10 p-3 text-sm text-[var(--destructive,#ef4444)]">
          {error}
        </div>
      )}

      {/* General Settings */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <Globe className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text)]">General & Public Display</h2>
        </div>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-[var(--text)]">Blog Publication Name</label>
            <input
              type="text"
              value={form.blog_title}
              onChange={(e) => setForm({ ...form, blog_title: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="e.g. MultiPost Studio Blog"
            />
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-[var(--text)]">Default Publication Description</label>
            <textarea
              rows={2}
              value={form.blog_description}
              onChange={(e) => setForm({ ...form, blog_description: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="Default meta description for the blog index and RSS feed."
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">Canonical Base URL</label>
            <input
              type="url"
              value={form.canonical_base_url}
              onChange={(e) => setForm({ ...form, canonical_base_url: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="https://multipost.studio"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">Articles Per Page</label>
            <input
              type="number"
              min={1}
              max={100}
              value={form.posts_per_page}
              onChange={(e) => setForm({ ...form, posts_per_page: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">Default Fallback Author</label>
            <select
              value={form.default_author_id}
              onChange={(e) => setForm({ ...form, default_author_id: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
            >
              <option value="">None (MultiPost Studio Team)</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--text)]">Default Social Share (OG) Image URL</label>
            <input
              type="text"
              value={form.default_og_image}
              onChange={(e) => setForm({ ...form, default_og_image: e.target.value })}
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text)] focus:border-[var(--accent)] focus:outline-none"
              placeholder="/brand/og-default.png"
            />
          </div>
        </div>
      </div>

      {/* Reader Engagement & Comments */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <MessageSquare className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text)]">Reader Comments & Discussion</h2>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Enable Reader Comments</p>
              <p className="text-xs text-[var(--text-muted)]">
                Allow visitors to leave comments on published blog articles.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.comments_enabled === "true"}
              onChange={(e) => setForm({ ...form, comments_enabled: e.target.checked ? "true" : "false" })}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Hold All Comments for Review</p>
              <p className="text-xs text-[var(--text-muted)]">
                Require platform admin approval before newly submitted comments appear publicly.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.comments_auto_approve === "false"}
              onChange={(e) => setForm({ ...form, comments_auto_approve: e.target.checked ? "false" : "true" })}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
          </label>
        </div>
      </div>

      {/* Syndication & Feeds */}
      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center gap-2 border-b border-[var(--border)] pb-3">
          <Rss className="h-5 w-5 text-[var(--accent)]" />
          <h2 className="text-base font-semibold text-[var(--text)]">Syndication & RSS Feeds</h2>
        </div>

        <div className="mt-4 space-y-4">
          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Enable RSS & Atom Syndication Feeds</p>
              <p className="text-xs text-[var(--text-muted)]">
                Publish public XML feeds at <code className="font-mono text-[var(--accent)]">/blog/feed.xml</code> and{" "}
                <code className="font-mono text-[var(--accent)]">/blog/atom.xml</code> for reader aggregators.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.rss_enabled === "true"}
              onChange={(e) => setForm({ ...form, rss_enabled: e.target.checked ? "true" : "false" })}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Show Reading Time Estimates</p>
              <p className="text-xs text-[var(--text-muted)]">
                Display automatic word-count based reading time (e.g. &ldquo;4 min read&rdquo;) on article cards and headers.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.reading_time_enabled === "true"}
              onChange={(e) => setForm({ ...form, reading_time_enabled: e.target.checked ? "true" : "false" })}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
          </label>

          <label className="flex items-center justify-between rounded-lg border border-[var(--border)] p-3 cursor-pointer hover:bg-[var(--surface-hover)]">
            <div>
              <p className="text-sm font-medium text-[var(--text)]">Display Social Share Bar</p>
              <p className="text-xs text-[var(--text-muted)]">
                Show Twitter/X, LinkedIn, Facebook, and copy link action buttons on public articles.
              </p>
            </div>
            <input
              type="checkbox"
              checked={form.social_share_enabled === "true"}
              onChange={(e) => setForm({ ...form, social_share_enabled: e.target.checked ? "true" : "false" })}
              className="h-4 w-4 rounded border-[var(--border)] text-[var(--accent)]"
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-[var(--primary-text)] hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <span>Saving changes...</span>
          ) : saved ? (
            <>
              <Check className="h-4 w-4" />
              <span>Saved!</span>
            </>
          ) : (
            <>
              <Save className="h-4 w-4" />
              <span>Save Blog Settings</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
}
