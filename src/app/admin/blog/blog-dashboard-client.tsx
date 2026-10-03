"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  Search,
  Upload,
  Eye,
  Copy,
  Trash2,
  RotateCcw,
  ExternalLink,
  ChevronDown,
  CheckSquare,
  Square,
  FileText,
  Clock,
  Sparkles,
  BarChart2,
  MessageSquare,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { BlogStatusBadge } from "./_components/blog-status-badge";
import { type BlogPostListItem, type BlogFilterOptions } from "@/lib/blog";
import { formatDate } from "@/lib/utils";
import {
  duplicateBlogPostAction,
  deleteBlogPostAction,
  restoreBlogPostAction,
  bulkBlogPostAction,
  setBlogPostStatusAction,
} from "@/app/actions/blog";
import { Donut, Bars } from "@/components/charts";

export function BlogDashboardClient({
  initialPosts,
  total,
  page,
  pageSize,
  totalPages,
  metrics,
  categories,
  authors,
  currentFilters,
}: {
  initialPosts: BlogPostListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  metrics: {
    kpis: {
      totalPosts: number;
      published: number;
      drafts: number;
      scheduled: number;
      pendingReview: number;
      archived: number;
      trash: number;
      totalViews: number;
      totalShares: number;
      totalComments: number;
      pendingComments: number;
      postsThisMonth: number;
      postsThisWeek: number;
      mostViewed: { id: string; title: string; slug: string; views: number } | null;
    };
    statusDistribution: { label: string; value: number; key: string }[];
    categoryPerformance: { label: string; posts: number }[];
    recentPosts: { id: string; title: string; slug: string; status: string; views: number; updatedAt: Date }[];
  };
  categories: { id: string; name: string; slug: string }[];
  authors: { id: string; name: string }[];
  currentFilters: BlogFilterOptions;
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [searchQuery, setSearchQuery] = React.useState(currentFilters.q || "");
  const [actionLoading, setActionLoading] = React.useState(false);

  const k = metrics.kpis;

  function updateQuery(patches: Record<string, string | number | undefined>) {
    const params = new URLSearchParams(window.location.search);
    for (const [key, val] of Object.entries(patches)) {
      if (val === undefined || val === "" || val === "all") {
        params.delete(key);
      } else {
        params.set(key, String(val));
      }
    }
    params.delete("page"); // reset page on filter change
    router.push(`/admin/blog?${params.toString()}`);
  }

  function toggleSelectAll() {
    if (selectedIds.length === initialPosts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(initialPosts.map((p) => p.id));
    }
  }

  function toggleSelect(id: string) {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((item) => item !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  }

  async function handleDuplicate(id: string) {
    setActionLoading(true);
    try {
      const res = await duplicateBlogPostAction(id);
      if (res.ok) {
        router.refresh();
      } else {
        alert(res.error || "Failed to duplicate post");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleDelete(id: string, permanent = false) {
    const msg = permanent
      ? "Permanently delete this post? This cannot be undone."
      : "Move post to trash?";
    if (!confirm(msg)) return;

    setActionLoading(true);
    try {
      const res = await deleteBlogPostAction(id, permanent);
      if (res.ok) {
        router.refresh();
      } else {
        alert(res.error || "Failed to delete post");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRestore(id: string) {
    setActionLoading(true);
    try {
      const res = await restoreBlogPostAction(id);
      if (res.ok) {
        router.refresh();
      } else {
        alert(res.error || "Failed to restore post");
      }
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkAction(action: "publish" | "unpublish" | "archive" | "trash" | "restore" | "delete") {
    if (!selectedIds.length) return;
    const msg =
      action === "delete"
        ? `Permanently delete ${selectedIds.length} selected post(s)?`
        : `Apply ${action} to ${selectedIds.length} selected post(s)?`;
    if (!confirm(msg)) return;

    setActionLoading(true);
    try {
      const res = await bulkBlogPostAction({ ids: selectedIds, action });
      if (res.ok) {
        setSelectedIds([]);
        router.refresh();
      } else {
        alert(res.error || "Bulk action failed");
      }
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-sm">
          <p className="text-[12px] font-medium text-[var(--text-subtle)]">Total Articles</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{k.totalPosts}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">+{k.postsThisMonth} this month</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-sm">
          <p className="text-[12px] font-medium text-[var(--text-subtle)]">Published</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--success)]">{k.published}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Live on /blog</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-sm">
          <p className="text-[12px] font-medium text-[var(--text-subtle)]">Drafts & Review</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{k.drafts + k.pendingReview}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{k.pendingReview} in review</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-sm">
          <p className="text-[12px] font-medium text-[var(--text-subtle)]">Scheduled</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--info)]">{k.scheduled}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Queued for auto-publish</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-sm">
          <p className="text-[12px] font-medium text-[var(--text-subtle)]">Total Reads / Views</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{k.totalViews}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{k.totalShares} social shares</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-3.5 shadow-sm">
          <p className="text-[12px] font-medium text-[var(--text-subtle)]">Comments</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[var(--text)]">{k.totalComments}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">{k.pendingComments} pending review</p>
        </div>
      </div>

      {/* Visual Analytics Bar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <h3 className="text-[14px] font-semibold text-[var(--text)]">Content Status Distribution</h3>
          <p className="text-[12px] text-[var(--text-muted)]">Breakdown of content lifecycle stages.</p>
          <div className="mt-4">
            {metrics.statusDistribution.length > 0 ? (
              <Donut
                data={metrics.statusDistribution.map((s) => ({ name: s.label, value: s.value }))}
                height={190}
              />
            ) : (
              <div className="flex h-36 items-center justify-center text-[13px] text-[var(--text-muted)]">
                No articles created yet.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <h3 className="text-[14px] font-semibold text-[var(--text)]">Category Distribution</h3>
          <p className="text-[12px] text-[var(--text-muted)]">Published articles per editorial category.</p>
          <div className="mt-4">
            {metrics.categoryPerformance.length > 0 ? (
              <Bars
                data={metrics.categoryPerformance.map((c) => ({ label: c.label, posts: c.posts }))}
                dataKey="posts"
                xKey="label"
                color="var(--primary)"
                height={190}
              />
            ) : (
              <div className="flex h-36 items-center justify-center text-[13px] text-[var(--text-muted)]">
                No categorized articles yet.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions & Filters Toolbar */}
      <div className="space-y-3">
        {/* Status Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-2">
          <div className="flex flex-wrap items-center gap-1">
            {[
              { id: "all", label: "All Posts", count: k.totalPosts },
              { id: "published", label: "Published", count: k.published },
              { id: "draft", label: "Drafts", count: k.drafts },
              { id: "scheduled", label: "Scheduled", count: k.scheduled },
              { id: "pending_review", label: "In Review", count: k.pendingReview },
              { id: "archived", label: "Archived", count: k.archived },
              { id: "trash", label: "Trash", count: k.trash },
            ].map((t) => {
              const active = currentFilters.status === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => updateQuery({ status: t.id })}
                  className={`flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[13px] font-medium transition-colors ${
                    active
                      ? "bg-[var(--primary)] text-[var(--primary-text)] shadow-xs"
                      : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                  }`}
                >
                  <span>{t.label}</span>
                  <span className={`rounded-full px-1.5 py-0.2 text-[11px] tabular-nums ${active ? "bg-black/25 text-[var(--primary-text)]" : "bg-[var(--surface-hover)] text-[var(--text-subtle)]"}`}>
                    {t.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <Link href="/admin/blog/import">
              <Button variant="outline" size="sm" className="gap-1.5">
                <Upload size={14} />
                <span>Bulk Import</span>
              </Button>
            </Link>
            <Link href="/admin/blog/new">
              <Button variant="primary" size="sm" className="gap-1.5 shadow-xs">
                <Plus size={15} />
                <span>New Article</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-1 flex-wrap items-center gap-2 sm:max-w-2xl">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
              <Input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && updateQuery({ q: searchQuery })}
                placeholder="Search articles by title, slug, excerpt..."
                className="pl-8 text-[13px]"
              />
            </div>

            <select
              value={currentFilters.categoryId || "all"}
              onChange={(e) => updateQuery({ category: e.target.value })}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              value={currentFilters.authorId || "all"}
              onChange={(e) => updateQuery({ author: e.target.value })}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
            >
              <option value="all">All Authors</option>
              {authors.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={currentFilters.sort || "newest"}
              onChange={(e) => updateQuery({ sort: e.target.value })}
              className="h-9 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] px-3 text-[13px] text-[var(--text)]"
            >
              <option value="newest">Newest First</option>
              <option value="oldest">Oldest First</option>
              <option value="updated">Recently Updated</option>
              <option value="views">Most Views</option>
              <option value="title">Alphabetical (A-Z)</option>
              <option value="scheduled">Scheduled Date</option>
            </select>
          </div>

          {/* Bulk Actions Menu (when items selected) */}
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--primary)] bg-[var(--primary-soft)] px-3 py-1.5 text-[13px]">
              <span className="font-semibold text-[var(--primary)]">{selectedIds.length} selected</span>
              <span className="text-[var(--border)]">|</span>
              {currentFilters.status === "trash" ? (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkAction("restore")}
                    className="font-medium text-[var(--primary)] hover:underline"
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction("delete")}
                    className="font-medium text-[var(--danger)] hover:underline"
                  >
                    Delete Permanently
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => handleBulkAction("publish")}
                    className="font-medium text-[var(--success)] hover:underline"
                  >
                    Publish
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction("unpublish")}
                    className="font-medium text-[var(--text-muted)] hover:underline"
                  >
                    Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction("archive")}
                    className="font-medium text-[var(--text-muted)] hover:underline"
                  >
                    Archive
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBulkAction("trash")}
                    className="font-medium text-[var(--danger)] hover:underline"
                  >
                    Trash
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posts Table */}
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
        <table className="w-full min-w-[760px] text-left border-collapse text-[13.5px]">
          <thead>
            <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[12px] font-semibold text-[var(--text-subtle)]">
              <th className="w-10 px-4 py-3">
                <button type="button" onClick={toggleSelectAll} aria-label="Select all posts" className="flex items-center text-[var(--text-muted)]">
                  {selectedIds.length > 0 && selectedIds.length === initialPosts.length ? (
                    <CheckSquare size={16} className="text-[var(--primary)]" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
              </th>
              <th className="px-4 py-3">Article Title & Details</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Author</th>
              <th className="px-4 py-3 text-right">Reads</th>
              <th className="px-4 py-3">Date</th>
              <th className="w-24 px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {initialPosts.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[14px] text-[var(--text-muted)]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <FileText size={32} className="text-[var(--text-subtle)]" />
                    <p className="font-medium text-[var(--text)]">No blog posts found</p>
                    <p className="text-[13px] text-[var(--text-subtle)]">
                      {currentFilters.status === "trash"
                        ? "Trash is empty."
                        : "Create your first article or import posts in bulk to get started."}
                    </p>
                    {currentFilters.status !== "trash" && (
                      <Link href="/admin/blog/new" className="mt-2">
                        <Button variant="primary" size="sm" className="gap-1.5">
                          <Plus size={14} />
                          <span>Create Post</span>
                        </Button>
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              initialPosts.map((post) => {
                const isSelected = selectedIds.includes(post.id);
                return (
                  <tr
                    key={post.id}
                    className={`transition-colors hover:bg-[var(--surface-hover)] ${
                      isSelected ? "bg-[var(--primary-soft)]/30" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => toggleSelect(post.id)}
                        className="flex items-center text-[var(--text-muted)]"
                      >
                        {isSelected ? <CheckSquare size={16} className="text-[var(--primary)]" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="min-w-0">
                        <Link
                          href={`/admin/blog/${post.id}`}
                          className="font-semibold text-[var(--text)] hover:text-[var(--primary)] hover:underline line-clamp-1"
                        >
                          {post.title}
                        </Link>
                        {post.excerpt && (
                          <p className="mt-0.5 text-[12px] text-[var(--text-muted)] line-clamp-1">{post.excerpt}</p>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-[var(--text-subtle)]">
                          <span>/blog/{post.slug}</span>
                          <span>·</span>
                          <span>{post.readMins} min read</span>
                          {post.tags.length > 0 && (
                            <>
                              <span>·</span>
                              <div className="flex gap-1">
                                {post.tags.slice(0, 3).map((t) => (
                                  <span key={t.tag.id} className="rounded bg-[var(--surface-hover)] px-1.5 py-0.2">
                                    #{t.tag.name}
                                  </span>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <BlogStatusBadge status={post.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px] text-[var(--text)]">
                      {post.category ? post.category.name : <span className="text-[var(--text-subtle)]">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[13px] text-[var(--text-muted)]">
                      {post.author ? post.author.name : <span className="text-[var(--text-subtle)]">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right tabular-nums font-medium text-[var(--text)]">
                      {post.views}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-[12px] text-[var(--text-muted)]">
                      {post.status === "scheduled" && post.scheduledAt ? (
                        <div className="flex items-center gap-1 text-[var(--info)]">
                          <Clock size={12} />
                          <span>{new Date(post.scheduledAt).toLocaleDateString()}</span>
                        </div>
                      ) : post.publishedAt ? (
                        formatDate(post.publishedAt)
                      ) : (
                        formatDate(post.updatedAt)
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        {post.status === "published" && (
                          <Link
                            href={`/blog/${post.slug}`}
                            target="_blank"
                            className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                            title="View live article"
                          >
                            <ExternalLink size={15} />
                          </Link>
                        )}
                        <Link
                          href={`/admin/blog/${post.id}`}
                          className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                          title="Edit"
                          aria-label={`Edit post ${post.title}`}
                        >
                          <Eye size={15} />
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDuplicate(post.id)}
                          className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                          title="Duplicate"
                          aria-label={`Duplicate post ${post.title}`}
                        >
                          <Copy size={15} />
                        </button>
                        {currentFilters.status === "trash" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleRestore(post.id)}
                              className="rounded p-1 text-[var(--success)] hover:bg-[var(--surface-hover)]"
                              title="Restore"
                              aria-label={`Restore post ${post.title}`}
                            >
                              <RotateCcw size={15} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(post.id, true)}
                              className="rounded p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]"
                              title="Delete permanently"
                              aria-label={`Delete post ${post.title} permanently`}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDelete(post.id, false)}
                            className="rounded p-1 text-[var(--danger)] hover:bg-[var(--surface-hover)]"
                            title="Move to trash"
                            aria-label={`Move post ${post.title} to trash`}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-[13px] text-[var(--text-muted)]">
          <p>
            Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} articles
          </p>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => updateQuery({ page: page - 1 })}
            >
              Previous
            </Button>
            <span className="px-2 text-[12px] font-semibold tabular-nums text-[var(--text)]">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => updateQuery({ page: page + 1 })}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
