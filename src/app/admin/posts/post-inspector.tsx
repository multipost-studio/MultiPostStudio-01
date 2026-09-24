"use client";

import * as React from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDate, relativeTime } from "@/lib/utils";
import { useAdminAction } from "@/app/admin/admin-client";
import { adminArchivePostAction } from "@/app/actions/admin";

export type PostInspectorData = {
  id: string;
  title: string | null;
  status: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  author: { name: string; email: string };
  workspace: { name: string; org: { name: string; slug: string } };
  channels: {
    platform: string;
    body: string;
    status: string;
    error: string | null;
    publishedUrl: string | null;
  }[];
  media: {
    url: string;
    mimeType: string;
    filename: string | null;
  }[];
};

export function PostInspectorButton({
  post,
}: {
  post: PostInspectorData;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeChannelIdx, setActiveChannelIdx] = React.useState(0);
  const { busy, run } = useAdminAction();

  const isArchived = post.status === "archived";
  const currentChannel = post.channels[activeChannelIdx] || post.channels[0];

  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setOpen(true)}
        className="text-xs font-medium"
      >
        Inspect
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4 bg-[var(--surface-subtle)]">
              <div>
                <h3 className="font-semibold text-base text-[var(--text)]">
                  {post.title || "Post Inspection"}
                </h3>
                <p className="text-xs font-mono text-[var(--text-subtle)]">ID: {post.id}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                ✕
              </Button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Meta Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
                <div>
                  <p className="text-[var(--text-subtle)] font-medium">Author</p>
                  <p className="font-semibold text-[var(--text)] mt-0.5 truncate">{post.author.name}</p>
                  <p className="text-[11px] text-[var(--text-subtle)] truncate">{post.author.email}</p>
                </div>
                <div>
                  <p className="text-[var(--text-subtle)] font-medium">Organization</p>
                  <p className="font-semibold text-[var(--text)] mt-0.5 truncate">{post.workspace.org.name}</p>
                  <p className="text-[11px] text-[var(--text-subtle)] truncate">{post.workspace.name}</p>
                </div>
                <div>
                  <p className="text-[var(--text-subtle)] font-medium">Status</p>
                  <Badge
                    tone={
                      post.status === "published"
                        ? "success"
                        : post.status === "failed"
                        ? "danger"
                        : post.status === "scheduled"
                        ? "info"
                        : "neutral"
                    }
                    className="capitalize mt-1"
                  >
                    {post.status.replace(/_/g, " ")}
                  </Badge>
                </div>
                <div>
                  <p className="text-[var(--text-subtle)] font-medium">Date</p>
                  <p className="text-[var(--text)] mt-0.5">
                    {post.scheduledAt
                      ? formatDate(post.scheduledAt)
                      : formatDate(post.createdAt)}
                  </p>
                  <p className="text-[11px] text-[var(--text-subtle)]">
                    {relativeTime(post.scheduledAt || post.createdAt)}
                  </p>
                </div>
              </div>

              {/* Error Notice if failed */}
              {post.channels.some((c) => c.error) && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-3 text-xs text-[var(--danger)] space-y-1">
                  <p className="font-bold">Publishing Failure Detected:</p>
                  {post.channels.map(
                    (c, i) =>
                      c.error && (
                        <p key={i} className="font-mono text-[11px]">
                          [{c.platform.toUpperCase()}]: {c.error}
                        </p>
                      )
                  )}
                </div>
              )}

              {/* Target Platforms & Channel Selection */}
              <div>
                <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                  Target Social Platforms ({post.channels.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  {post.channels.map((c, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveChannelIdx(idx)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                        activeChannelIdx === idx
                          ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--text)] font-semibold shadow-sm"
                          : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-subtle)] hover:text-[var(--text)]"
                      }`}
                    >
                      <span className="capitalize">{c.platform}</span>
                      <Badge
                        tone={
                          c.status === "published"
                            ? "success"
                            : c.status === "failed"
                            ? "danger"
                            : "neutral"
                        }
                        className="text-[10px]"
                      >
                        {c.status}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>

              {/* Channel Caption / Body Preview */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider">
                    Content Body ({currentChannel?.platform || "default"})
                  </p>
                  {currentChannel?.publishedUrl && (
                    <a
                      href={currentChannel.publishedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[var(--primary)] hover:underline flex items-center gap-1"
                    >
                      Live Post Link ↗
                    </a>
                  )}
                </div>
                <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] p-4 font-sans text-sm text-[var(--text)] whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                  {currentChannel?.body || post.title || (
                    <span className="italic text-[var(--text-subtle)]">No text content in this post.</span>
                  )}
                </div>
              </div>

              {/* Media Attachments Gallery */}
              {post.media.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-[var(--text-subtle)] uppercase tracking-wider mb-2">
                    Media Attachments ({post.media.length})
                  </p>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {post.media.map((m, i) => (
                      <div
                        key={i}
                        className="group relative overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-subtle)] aspect-square flex items-center justify-center"
                      >
                        {m.mimeType.startsWith("video") ? (
                          <video
                            src={m.url}
                            controls
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <a href={m.url} target="_blank" rel="noopener noreferrer" className="h-full w-full">
                            <img
                              src={m.url}
                              alt={m.filename || "Post attachment"}
                              className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-105"
                            />
                          </a>
                        )}
                        <span className="absolute bottom-1 right-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-white font-mono">
                          {m.mimeType.split("/")[1]?.toUpperCase() || "MEDIA"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between border-t border-[var(--border)] px-6 py-3 bg-[var(--surface-subtle)]">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                Close
              </Button>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={isArchived ? "secondary" : "danger"}
                  loading={busy === "arch"}
                  onClick={() =>
                    run(
                      "arch",
                      () => adminArchivePostAction(post.id, !isArchived),
                      isArchived
                        ? "Restore this post from archives?"
                        : "Take down this post immediately? It will be archived and hidden across all workspaces."
                    )
                  }
                >
                  {isArchived ? "Restore Post" : "Take Down Post"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
