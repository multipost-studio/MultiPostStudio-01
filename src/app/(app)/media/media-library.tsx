"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, FolderPlus, Star, Trash2, Search, Film, FileText, Play, Pencil, X, Check } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input, Textarea, Select, Field } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { confirmDestructive } from "@/components/ui/confirm";
import { cn, formatNumber } from "@/lib/utils";
import {
  createFolderAction,
  renameFolderAction,
  deleteFolderAction,
  toggleFavoriteAction,
  deleteAssetAction,
  updateAssetAction,
} from "@/app/actions/media";
import { uploadFiles } from "@/lib/upload-media";
import { UnsplashPicker } from "@/components/unsplash-picker";
import { DrivePicker } from "@/components/drive-picker";

function UnsplashIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <path d="M12.5 0h7v8.5h-7V0zM12.5 12.5h7V32h-7V12.5zM0 12.5h9.5V32H0V12.5zM22.5 12.5H32V32h-9.5V12.5z" />
    </svg>
  );
}

function DriveIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 87.3 78" aria-hidden>
      <path fill="#0066da" d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z" />
      <path fill="#00ac47" d="M43.65 25L29.9 1.2c-1.35.8-2.5 1.9-3.3 3.3L.8 48.5c-.8 1.4-1.2 2.95-1.2 4.5h27.5z" />
      <path fill="#ea4335" d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75L86.15 53c.8-1.4 1.2-2.95 1.2-4.5H59.8l5.85 11.9z" />
      <path fill="#00832d" d="M43.65 25L57.4 1.2c-1.35-.8-2.9-1.2-4.5-1.2H34.4c-1.6 0-3.15.45-4.5 1.2z" />
      <path fill="#2684fc" d="M59.8 53H27.5l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z" />
      <path fill="#ffba00" d="M73.4 26.5L60.6 4.5c-.8-1.4-1.95-2.5-3.3-3.3L43.55 25l16.25 28h27.45c0-1.55-.4-3.1-1.2-4.5z" />
    </svg>
  );
}

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
  unsplashEnabled,
  driveEnabled,
}: {
  assets: Asset[];
  folders: { id: string; name: string }[];
  canEdit: boolean;
  unsplashEnabled?: boolean;
  driveEnabled?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [folder, setFolder] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const [favOnly, setFavOnly] = React.useState(false);
  const [detail, setDetail] = React.useState<Asset | null>(null);
  const [altDraft, setAltDraft] = React.useState("");
  const [savingAlt, setSavingAlt] = React.useState(false);

  function openDetail(a: Asset) {
    setDetail(a);
    setAltDraft(a.altText ?? "");
  }
  const [uploading, setUploading] = React.useState(false);
  const [folderOpen, setFolderOpen] = React.useState(false);
  const [unsplashOpen, setUnsplashOpen] = React.useState(false);
  const [driveOpen, setDriveOpen] = React.useState(false);
  const [editingFolder, setEditingFolder] = React.useState<string | null>(null);
  const [folderNameDraft, setFolderNameDraft] = React.useState("");
  const fileRef = React.useRef<HTMLInputElement>(null);

  async function saveFolderName(id: string) {
    const name = folderNameDraft.trim();
    setEditingFolder(null);
    if (!name) return;
    const res = await renameFolderAction(id, name);
    toast({ title: res.ok ? "Folder renamed" : "Couldn't rename", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) router.refresh();
  }

  async function removeFolder(id: string, name: string) {
    const sure = await confirmDestructive({
      title: `Delete "${name}"?`,
      body: "Files inside this folder move to Unfiled — they aren't deleted.",
      confirmLabel: "Delete folder",
    });
    if (!sure) return;
    const res = await deleteFolderAction(id);
    toast({ title: res.ok ? "Folder deleted" : "Couldn't delete", description: res.error, tone: res.ok ? "success" : "error" });
    if (res.ok) {
      if (folder === id) setFolder("all");
      router.refresh();
    }
  }

  const filtered = assets.filter(
    (a) =>
      (folder === "all" || (folder === "unfiled" ? !a.folderId : a.folderId === folder)) &&
      (!favOnly || a.favorite) &&
      (!q || a.filename.toLowerCase().includes(q.toLowerCase()) || a.altText?.toLowerCase().includes(q.toLowerCase())),
  );

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const folderId = folder !== "all" && folder !== "unfiled" ? folder : null;
    setUploading(true);
    const { okCount, firstError } = await uploadFiles(Array.from(files), { folderId });
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
              {unsplashEnabled && (
                <Button size="sm" variant="secondary" onClick={() => setUnsplashOpen(true)}>
                  <UnsplashIcon /> Unsplash
                </Button>
              )}
              {driveEnabled && (
                <Button size="sm" variant="secondary" onClick={() => setDriveOpen(true)}>
                  <DriveIcon /> Drive
                </Button>
              )}
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
          {[{ id: "all", name: "All media" }, { id: "unfiled", name: "Unfiled" }].map((f) => (
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
          {folders.map((f) =>
            editingFolder === f.id ? (
              <div key={f.id} className="flex items-center gap-1 px-1">
                <Input
                  autoFocus
                  value={folderNameDraft}
                  onChange={(e) => setFolderNameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveFolderName(f.id);
                    if (e.key === "Escape") setEditingFolder(null);
                  }}
                  className="h-7 text-[13px]"
                />
                <span role="button" tabIndex={0} onClick={() => saveFolderName(f.id)} className="shrink-0 rounded p-1 text-[var(--success)] hover:bg-[var(--surface-hover)]" title="Save">
                  <Check size={14} />
                </span>
                <span role="button" tabIndex={0} onClick={() => setEditingFolder(null)} className="shrink-0 rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface-hover)]" title="Cancel">
                  <X size={14} />
                </span>
              </div>
            ) : (
              <div
                key={f.id}
                className={cn(
                  "group flex items-center rounded-[var(--radius-md)] pr-1",
                  folder === f.id ? "bg-[var(--primary-soft)]" : "hover:bg-[var(--surface-hover)]",
                )}
              >
                <button
                  onClick={() => setFolder(f.id)}
                  className={cn(
                    "flex-1 truncate px-2.5 py-1.5 text-left text-[14px]",
                    folder === f.id ? "text-[var(--primary)]" : "text-[var(--text-muted)]",
                  )}
                >
                  {f.name}
                </button>
                {canEdit && (
                  <span className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        setFolderNameDraft(f.name);
                        setEditingFolder(f.id);
                      }}
                      className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface)]"
                      title="Rename"
                    >
                      <Pencil size={12} />
                    </span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={() => removeFolder(f.id, f.name)}
                      className="rounded p-1 text-[var(--text-subtle)] hover:bg-[var(--surface)] hover:text-[var(--danger)]"
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </span>
                  </span>
                )}
              </div>
            ),
          )}
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
                  onClick={() => openDetail(a)}
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
                    {canEdit && (
                      <span className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavoriteAction(a.id).then(() => router.refresh());
                          }}
                          className="rounded-full bg-black/55 p-1.5 text-white hover:bg-black/70"
                          title={a.favorite ? "Unfavorite" : "Favorite"}
                        >
                          <Star size={13} fill={a.favorite ? "currentColor" : "none"} />
                        </span>
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const res = await deleteAssetAction(a.id);
                            toast({ title: res.ok ? "Deleted" : "Can't delete", description: res.error, tone: res.ok ? "success" : "error" });
                            if (res.ok) router.refresh();
                          }}
                          className="rounded-full bg-black/55 p-1.5 text-white hover:bg-[var(--danger)]"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </span>
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
            {canEdit ? (
              <Field label="Alt text">
                <Textarea
                  value={altDraft}
                  onChange={(e) => setAltDraft(e.target.value)}
                  className="min-h-[70px]"
                  placeholder="Describe this image for screen readers…"
                />
              </Field>
            ) : (
              <div>
                <p className="text-[12px] font-semibold uppercase text-[var(--text-subtle)]">Alt text</p>
                <p className="text-[14px] text-[var(--text-muted)]">{detail.altText ?? "—"}</p>
              </div>
            )}
            <div>
              {(() => {
                // Unsplash photos store "Photo by X on Unsplash · <attribution url>"
                // — required attribution per Unsplash's API guidelines.
                const m = detail.aiDescription?.match(/^(Photo by .+ on Unsplash) · (https?:\/\/\S+)$/);
                if (m) {
                  return (
                    <>
                      <p className="text-[12px] font-semibold uppercase text-[var(--text-subtle)]">Attribution (required)</p>
                      <a href={m[2]} target="_blank" rel="noreferrer" className="text-[14px] text-[var(--primary)] underline">
                        {m[1]}
                      </a>
                    </>
                  );
                }
                return (
                  <>
                    <p className="text-[12px] font-semibold uppercase text-[var(--text-subtle)]">AI description</p>
                    <p className="text-[14px] text-[var(--text-muted)]">{detail.aiDescription ?? "—"}</p>
                  </>
                );
              })()}
            </div>
            {canEdit && folders.length > 0 && (
              <Field label="Folder">
                <Select
                  value={detail.folderId ?? ""}
                  onChange={async (e) => {
                    const folderId = e.target.value || null;
                    const res = await updateAssetAction(detail.id, { folderId });
                    if (res.ok) { setDetail({ ...detail, folderId }); router.refresh(); }
                  }}
                >
                  <option value="">Unfiled</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <p className="text-[12px] text-[var(--text-subtle)]">Uploaded by {detail.uploader}</p>
            {canEdit && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  loading={savingAlt}
                  onClick={async () => {
                    setSavingAlt(true);
                    const res = await updateAssetAction(detail.id, { altText: altDraft });
                    setSavingAlt(false);
                    toast({ title: res.ok ? "Saved" : "Couldn't save", description: res.error, tone: res.ok ? "success" : "error" });
                    if (res.ok) router.refresh();
                  }}
                >
                  Save
                </Button>
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

      {unsplashEnabled && (
        <Modal open={unsplashOpen} onClose={() => setUnsplashOpen(false)} title="Add from Unsplash" size="lg">
          <UnsplashPicker
            folderId={folder !== "all" && folder !== "unfiled" ? folder : null}
            onImported={() => router.refresh()}
          />
        </Modal>
      )}

      {driveEnabled && (
        <Modal open={driveOpen} onClose={() => setDriveOpen(false)} title="Add from Google Drive" size="lg">
          <DrivePicker
            folderId={folder !== "all" && folder !== "unfiled" ? folder : null}
            onImported={() => router.refresh()}
          />
        </Modal>
      )}
    </>
  );
}
