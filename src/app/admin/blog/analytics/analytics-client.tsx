"use client";

import * as React from "react";
import Link from "next/link";
import { Eye, Share2, Clock, TrendingUp, BarChart3, ExternalLink } from "lucide-react";
import { TrendArea } from "@/components/charts";
import { formatNumber, formatDate } from "@/lib/utils";

type TopPostItem = {
  id: string;
  title: string;
  slug: string;
  views: number;
  shares: number;
  readMins: number;
  status: string;
  publishedAt: Date | null;
  author: { name: string } | null;
  category: { name: string } | null;
};

export function BlogAnalyticsClient({
  metrics,
  timeSeries,
  topPosts,
  categories,
}: {
  metrics: {
    kpis: {
      totalPosts: number;
      published: number;
      totalViews: number;
      totalShares: number;
      totalComments: number;
    };
  };
  timeSeries: { label: string; published: number; views: number }[];
  topPosts: TopPostItem[];
  categories: { id: string; name: string; _count: { posts: number } }[];
}) {
  const k = metrics.kpis;
  const avgViewsPerPost = k.published > 0 ? Math.round(k.totalViews / k.published) : 0;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-subtle)] text-[12px] font-medium">
            <Eye size={15} className="text-[var(--primary)]" />
            <span>Total Article Reads</span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{formatNumber(k.totalViews)}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Across {k.published} published articles</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-subtle)] text-[12px] font-medium">
            <TrendingUp size={15} className="text-[var(--success)]" />
            <span>Avg. Reads / Article</span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{formatNumber(avgViewsPerPost)}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Readership density</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-subtle)] text-[12px] font-medium">
            <Share2 size={15} className="text-[var(--info)]" />
            <span>Social Shares</span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{formatNumber(k.totalShares)}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Shared on X & LinkedIn</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--text-subtle)] text-[12px] font-medium">
            <BarChart3 size={15} className="text-[var(--warning)]" />
            <span>Active Categories</span>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--text)]">{categories.length}</p>
          <p className="mt-1 text-[11px] text-[var(--text-muted)]">Editorial topics</p>
        </div>
      </div>

      {/* Trend Area Chart */}
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-5 shadow-sm">
        <h3 className="text-base font-semibold text-[var(--text)]">Readership & Views (Last 30 Days)</h3>
        <p className="text-[12px] text-[var(--text-muted)]">Daily readership volume over time.</p>
        <div className="mt-4">
          <TrendArea
            data={timeSeries}
            dataKey="views"
            xKey="label"
            height={240}
            color="var(--primary)"
          />
        </div>
      </div>

      {/* Top Performing Articles Table */}
      <div className="space-y-3">
        <h3 className="text-base font-semibold text-[var(--text)]">Top Articles by Engagement & Views</h3>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs">
          <table className="w-full text-left border-collapse text-[13.5px]">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] text-[12px] font-semibold text-[var(--text-subtle)]">
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Article Title</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3 text-right">Views</th>
                <th className="px-4 py-3 text-right">Shares</th>
                <th className="px-4 py-3">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)]">
              {topPosts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-[13px] text-[var(--text-muted)]">
                    No articles recorded yet.
                  </td>
                </tr>
              ) : (
                topPosts.map((post, index) => (
                  <tr key={post.id} className="transition-colors hover:bg-[var(--surface-hover)]">
                    <td className="px-4 py-3 font-mono text-[12px] text-[var(--text-subtle)]">
                      {index + 1}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--text)]">
                      <Link
                        href={`/admin/blog/${post.id}`}
                        className="hover:text-[var(--primary)] hover:underline line-clamp-1"
                      >
                        {post.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
                      {post.category?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-[13px] text-[var(--text-muted)]">
                      {post.author?.name || "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold text-[var(--text)]">
                      {formatNumber(post.views)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[var(--text-muted)]">
                      {formatNumber(post.shares)}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[var(--text-subtle)] whitespace-nowrap">
                      {post.publishedAt ? formatDate(post.publishedAt) : "Draft"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
