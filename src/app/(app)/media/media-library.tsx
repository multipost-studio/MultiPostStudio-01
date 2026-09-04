"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FolderPlus, Star, Trash2, Search, Film, FileText, Play } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { cn, formatNumber } from "@/lib/utils";
import {
  uploadMediaAction,
  createUploadUrlAction,
  registerMediaAction,
  createFolderAction,
  toggleFavoriteAction,
  deleteAssetAction,
} from "@/app/actions/media";

type Asset = {
  id: string;
  url: string;
  thumbUrl: string | null;
  kind: string;
  filename: string;
  sizeBytes: number;
  altText: string | null;
  aiDescription: string | null;
  favorite: boolean;
  folderId: string | null;
  usage: number;
  uploader: string;
  createdAt: string;
};

export function MediaLibrary({
  assets,
  folders,
  canEdit,
}: {
  assets: Asset[];
  folders: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [folder, setFolder] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const [favOnly, setFavOnly] = React.useState(false);
  const [detail, setDetail] = React.useState<Asset | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [folderOpen, setFolderOpen] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const filtered = assets.filter(
    (a) =>
      (folder === "all" || (folder === "unfiled" ? !a.folderId : a.folderId === folder)) &&
      (!favOnly || a.favorite) &&
      (!q || a.filename.toLowerCase().includes(q.toLowerCase()) || a.altText?.toLowerCase().includes(q.toLowerCase())),
  );

  /**
   * Grab a poster frame + dimensions from a video file, entirely in the
   * browser (no server transcode). Returns null if the browser can't decode it.
   */
  function capturePoster(
    file: File,
  ): Promise<{ blob: Blob; width: number; height: number; durationSec: number } | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.muted = true;
      video.preload = "metadata";
      video.src = url;
      const done = (v: { blob: Blob; width: number; height: number; durationSec: number } | null) => {
        URL.revokeObjectURL(url);
        video.removeAttribute("src");
        resolve(v);
      };
      const fail = () => done(null);
      video.onerror = fail;
      video.onloadeddata = () => {
        // seek a little in to avoid black leader frames
        video.currentTime = Math.min(1, (video.duration || 2) / 2);
      };
      video.onseeked = () => {
        try {
          const scale = Math.min(1, 720 / (video.videoWidth || 720));
          const w = Math.round((video.videoWidth || 720) * scale);
          const h = Math.round((video.videoHeight || 405) * scale);
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const cx = canvas.getContext("2d");
          if (!cx) return fail();
          cx.drawImage(video, 0, 0, w, h);
          canvas.toBlob(
            (blob) =>
              blob
                ? done({ blob, width: video.videoWidth, height: video.videoHeight, durationSec: Math.round(video.duration || 0) })
                : fail(),
            "image/jpeg",
            0.8,
          );
        } catch {
          fail();
        }
      };
      setTimeout(fail, 15000); // give up on stubborn codecs
    });
  }

  /** PUT a blob to storage via a fresh presigned URL; returns its public URL. */
  async function putBlob(blob: Blob, filename: string, contentType: string): Promise<string | null> {
    const u = await createUploadUrlAction({ filename, contentType, size: blob.size });
    const presigned = u.ok ? u.data?.presigned : null;
    if (!presigned) return null;
    const put = await fetch(presigned.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: blob,
    });
    return put.ok ? presigned.publicUrl : null;
  }

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const folderId = folder !== "all" && folder !== "unfiled" ? folder : null;
    setUploading(true);

    const list = Array.from(files);
    const smallFallback: File[] = [];
    let okCount = 0;
    let firstError: string | undefined;

    // Large files (and everything, when storage is configured) go straight to
    // object storage via a presigned PUT — bypasses the serverless body cap.
    for (const f of list) {
      const contentType = f.type || "application/octet-stream";
      const u = await createUploadUrlAction({ filename: f.name, contentType, size: f.size });
      if (!u.ok) {
        firstError ??= u.error;
        continue;
      }
      const presigned = u.data?.presigned;
      if (!presigned) {
        smallFallback.push(f); // storage not configured — use the server path
        continue;
      }
      try {
        const put = await fetch(presigned.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": contentType },
          body: f,
        });
        if (!put.ok) throw new Error(`storage responded ${put.status}`);

        // Video: capture a poster frame in-browser and store it as the thumbnail.
        let thumbUrl: string | null = null;
        let dims: { width: number; height: number; durationSec: number } | null = null;
        if (contentType.startsWith("video/")) {
          const poster = await capturePoster(f);
          if (poster) {
            dims = poster;
            thumbUrl = await putBlob(
              poster.blob,
              f.name.replace(/\.[^.]+$/, "") + ".poster.jpg",
              "image/jpeg",
            );
          }
        }

        const reg = await registerMediaAction({
          key: presigned.key,
          url: presigned.publicUrl,
          filename: f.name,
          contentType,
          sizeBytes: f.size,
          folderId,
          thumbUrl,
          width: dims?.width ?? null,
          height: dims?.height ?? null,
          durationSec: dims?.durationSec ?? null,
        });
        if (reg.ok) okCount++;
        else firstError ??= reg.error;
      } catch (e) {
        firstError ??= e instanceof Error ? e.message : "Upload failed";
      }
    }

    // Fallback path: small files when object storage isn't configured (dev).
    if (smallFallback.length > 0) {
      const fd = new FormData();
      for (const f of smallFallback) fd.append("files", f);
      if (folderId) fd.append("folderId", folderId);
      const res = await uploadMediaAction(fd);
      if (res.ok) okCount += smallFallback.length;
      else firstError ??= res.error;
    }

    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    toast({
      title: okCount > 0 ? `${okCount} file${okCount === 1 ? "" : "s"} uploaded` : "Upload failed",
      description: firstError,
      tone: okCount > 0 ? "success" : "error",
    });
    if (okCount > 0) router.refresh();
  }

  return (
    <>
      <PageHeader
        title="Media Library"
        description="Images, video and brand assets. Reused across the composer and templates."
        actions={
          canEdit && (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setFolderOpen(true)}>
                <FolderPlus size={15} /> Folder
              </Button>
              <Button size="sm" loading={uploading} onClick={() => fileRef.current?.click()}>
                <Upload size={15} /> Upload
              </Button>
              <input ref={fileRef} type="file" multiple accept="image/*,video/*,.pdf" className="hidden" onChange={(e) => onFiles(e.target.files)} />
            </div>
          )
        }
      />

      <div className="grid gap-4 lg:grid-cols-[200px_1fr]">
        <aside className="space-y-1">
          {[
            { id: "all", name: "All media" },
            { id: "unfiled", name: "Unfiled" },
            ...folders,
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={cn(
                "block w-full rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[14px]",
                folder === f.id ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
              )}
            >
              {f.name}
            </button>
          ))}
          <button
            onClick={() => setFavOnly((v) => !v)}
            className={cn(
              "mt-2 flex w-full items-center gap-1.5 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[14px]",
              favOnly ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)]",
            )}
          >
            <Star size={13} /> Favorites
          </button>
        </aside>

        <div>
          <div className="mb-3 flex items-center gap-2">
            <div className="relative flex-1 max-w-xs">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search files…" className="pl-8" />
            </div>
            <span className="text-[13px] text-[var(--text-subtle)]">{filtered.length} items</span>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={<Upload size={18} />}
              title="Nothing here yet"
              description={canEdit ? "Upload images or video to get started." : "No media in this folder."}
              action={canEdit && <Button size="sm" onClick={() => fileRef.current?.click()}>Upload files</Button>}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {filtered.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setDetail(a)}
                  className="group overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] text-left"
                >
                  <div className="relative aspect-square bg-[var(--bg-sunken)]">
                    {a.kind === "image" || (a.kind === "video" && a.thumbUrl && a.thumbUrl !== a.url) ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.thumbUrl ?? a.url} alt={a.altText ?? ""} className="h-full w-full object-cover" />
                        {a.kind === "video" && (
                          <span className="absolute inset-0 flex items-center justify-center">
                            <span className="rounded-full bg-black/55 p-2 text-white">
                              <Play size={18} fill="currentColor" />
                            </span>
                          </span>
                        )}
                      </>
                    ) : (
                      <div className="flex h-full items-center justify-center text-[var(--text-subtle)]">
                        {a.kind === "video" ? <Film size={28} /> : <FileText size={28} />}
                      </div>
                    )}
                    {a.favorite && (
                      <span className="absolute left-1.5 top-1.5 rounded-full bg-[var(--warning)] p-1 text-white">
                        <Star size={10} fill="currentColor" />
                      </span>
                    )}
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[13px] font-medium text-[var(--text)]">{a.filename}</p>
                    <p className="text-[11px] text-[var(--text-subtle)]">
                      {formatNumber(a.sizeBytes)}B · used {a.usage}×
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail */}
      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.filename} size="md">
        {detail && (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)]">
              {detail.kind === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={detail.url} alt={detail.altText ?? ""} className="max-h-[320px] w-full object-contain" />
              ) : detail.kind === "video" ? (
                <video
                  src={detail.url}
                  poster={detail.thumbUrl && detail.thumbUrl !== detail.url ? detail.thumbUrl : undefined}
                  controls
                  playsInline
                  className="max-h-[360px] w-full bg-black"
                />
              ) : (
                <div className="flex h-40 items-center justify-center text-[var(--text-subtle)]">
                  <FileText size={40} />
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[13px]">
              <Badge>{detail.kind}</Badge>
              <Badge tone="neutral">{formatNumber(detail.sizeBytes)} bytes</Badge>
              <Badge tone="neutral">used in {detail.usage} post{detail.usage === 1 ? "" : "s"}</Badge>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase text-[var(--text-subtle)]">Alt text</p>
              <p className="text-[14px] text-[var(--text-muted)]">{detail.altText ?? "—"}</p>
            </div>
            <div>
              <p className="text-[12px] font-semibold uppercase text-[var(--text-subtle)]">AI description</p>
              <p className="text-[14px] text-[var(--text-muted)]">{detail.aiDescription ?? "—"}</p>
            </div>
            <p className="text-[12px] text-[var(--text-subtle)]">Uploaded by {detail.uploader}</p>
            {canEdit && (
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={async () => { await toggleFavoriteAction(detail.id); setDetail(null); router.refresh(); }}>
                  <Star size={13} /> {detail.favorite ? "Unfavorite" : "Favorite"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    const res = await deleteAssetAction(detail.id);
                    toast({ title: res.ok ? "Deleted" : "Can't delete", description: res.error, tone: res.ok ? "success" : "error" });
                    if (res.ok) { setDetail(null); router.refresh(); }
                  }}
                >
                  <Trash2 size={13} /> Delete
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* New folder */}
      <Modal
        open={folderOpen}
        onClose={() => setFolderOpen(false)}
        title="New folder"
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setFolderOpen(false)}>Cancel</Button>
            <Button size="sm" type="submit" form="new-folder">Create</Button>
          </>
        }
      >
        <form
          id="new-folder"
          action={async (fd) => {
            const res = await createFolderAction(null, fd);
            toast({ title: res.ok ? "Folder created" : "Failed", description: res.error, tone: res.ok ? "success" : "error" });
            if (res.ok) { setFolderOpen(false); router.refresh(); }
          }}
        >
          <Input name="name" required placeholder="Folder name" autoFocus />
        </form>
      </Modal>
    </>
  );
}
