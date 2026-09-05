"use client";

import * as React from "react";
import { Search, Film, Image as ImageIcon, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/utils";
import { listDriveFilesAction, importDriveFileAction, driveThumbnailAction, type DriveFile } from "@/app/actions/drive";

/**
 * Google Drive file browser. Rows list by name/type/size (Drive's thumbnails
 * need a bearer token an <img src> can't send), but hovering a row fetches a
 * real preview through driveThumbnailAction (server-side, token attached,
 * returned as a data URI) — cached per file id so repeat hovers are free.
 */
export function DrivePicker({
  folderId = null,
  onImported,
}: {
  folderId?: string | null;
  onImported: (assetId: string) => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [files, setFiles] = React.useState<DriveFile[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [notConnected, setNotConnected] = React.useState(false);
  const [importing, setImporting] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const thumbCache = React.useRef<Map<string, string | null>>(new Map());
  const [, forceRerender] = React.useState(0);

  function onHover(f: DriveFile) {
    setHovered(f.id);
    if (!f.thumbnailLink || thumbCache.current.has(f.id)) return;
    driveThumbnailAction(f.thumbnailLink).then((res) => {
      thumbCache.current.set(f.id, res.ok && typeof res.data === "string" ? res.data : null);
      forceRerender((n) => n + 1);
    });
  }

  const term = q.trim();

  const load = React.useCallback(
    async (query: string) => {
      setLoading(true);
      const res = await listDriveFilesAction(query);
      setLoading(false);
      if (res.ok && res.data) {
        setFiles(res.data.files);
        setNotConnected(false);
      } else if (!res.ok) {
        setNotConnected(!!res.error?.includes("Connect Google Drive"));
        if (!res.error?.includes("Connect Google Drive")) toast({ title: res.error ?? "Couldn't load Drive files", tone: "error" });
      }
    },
    [toast],
  );

  React.useEffect(() => {
    const t = setTimeout(() => load(term), term ? 400 : 0);
    return () => clearTimeout(t);
  }, [term, load]);

  async function pick(f: DriveFile) {
    setImporting(f.id);
    const res = await importDriveFileAction({ fileId: f.id, name: f.name, folderId });
    setImporting(null);
    if (res.ok && typeof res.data === "string") {
      toast({ title: "File added", tone: "success" });
      onImported(res.data);
    } else {
      toast({ title: res.error ?? "Import failed", tone: "error" });
    }
  }

  if (notConnected) {
    return (
      <p className="py-6 text-center text-[14px] text-[var(--text-muted)]">
        Connect Google Drive on the{" "}
        <a href="/integrations" className="text-[var(--primary)] underline">Integrations</a> page first.
      </p>
    );
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search Drive files…" className="pl-9" />
      </div>

      {loading && (
        <p className="flex items-center justify-center gap-2 py-6 text-[13px] text-[var(--text-muted)]">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </p>
      )}

      {!loading && files.length === 0 && (
        <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">
          {term ? `No files matching "${term}".` : "No images or videos found in this Drive."}
        </p>
      )}

      {!loading && files.length > 0 && (
        <div className="max-h-[420px] space-y-1 overflow-y-auto">
          {files.map((f) => {
            const thumb = thumbCache.current.get(f.id);
            return (
              <div key={f.id} className="relative" onMouseEnter={() => onHover(f)} onMouseLeave={() => setHovered(null)}>
                <button
                  onClick={() => pick(f)}
                  disabled={importing !== null}
                  className="flex w-full items-center gap-3 rounded-[var(--radius-md)] border border-[var(--border)] p-2.5 text-left hover:border-[var(--primary)] disabled:opacity-60"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt="" className="h-full w-full rounded-[var(--radius-sm)] object-cover" />
                    ) : f.mimeType.startsWith("video/") ? (
                      <Film size={16} />
                    ) : (
                      <ImageIcon size={16} />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium text-[var(--text)]">{f.name}</span>
                    <span className="block text-[11.5px] text-[var(--text-subtle)]">
                      {f.size ? `${formatNumber(f.size)}B` : "size unknown"}
                      {f.modifiedTime ? ` · ${new Date(f.modifiedTime).toLocaleDateString()}` : ""}
                    </span>
                  </span>
                  {importing === f.id && <Loader2 size={14} className="shrink-0 animate-spin text-[var(--text-subtle)]" />}
                </button>
                {hovered === f.id && thumb && (
                  <div className="pointer-events-none absolute left-full top-0 z-10 ml-2 overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)] shadow-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumb} alt={f.name} className="h-40 w-40 object-cover" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
