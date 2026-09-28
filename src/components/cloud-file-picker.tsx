"use client";

import * as React from "react";
import { Loader2, Cloud, AlertCircle, Film, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { formatNumber } from "@/lib/utils";

export type CloudItem = { key: string; name: string; size?: number; modifiedTime?: string; isVideo?: boolean };

type ActionResult<T> = { ok: boolean; error?: string; message?: string; data?: T };

/**
 * Shared file-browser UI for cloud storage integrations that grant normal
 * folder access (Dropbox, OneDrive) — as opposed to Google Drive's
 * drive.file scope, which only permits access to files chosen through
 * Google's own Picker widget and so needs its own component (see
 * components/drive-picker.tsx).
 *
 * A provider wrapper supplies onList/onThumbnail/onImport and maps its own
 * item shape down to CloudItem (via a `key` the wrapper knows how to import
 * by — a Dropbox path, a OneDrive item id) and back up again inside its own
 * onImport implementation. This component itself is provider-agnostic.
 */
export function CloudFilePicker({
  providerLabel,
  connected,
  connectHref,
  onList,
  onThumbnail,
  onImport,
  onImported,
}: {
  providerLabel: string;
  connected: boolean;
  connectHref: string;
  onList: () => Promise<ActionResult<CloudItem[]>>;
  onThumbnail?: (item: CloudItem) => Promise<ActionResult<string | null>>;
  onImport: (items: CloudItem[]) => Promise<ActionResult<string[]>>;
  onImported: (assetId: string) => void;
}) {
  const { toast } = useToast();
  // Lazy initializer, not a setState call inside the effect: when
  // `connected` is false there's nothing to load, so "loading" starts false
  // for that case and true otherwise — no reason to flip it after mount.
  const [loading, setLoading] = React.useState(() => connected);
  const [error, setError] = React.useState<string | null>(null);
  const [files, setFiles] = React.useState<CloudItem[]>([]);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [thumbs, setThumbs] = React.useState<Record<string, string | null>>({});
  const [importing, setImporting] = React.useState(false);

  React.useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      const res = await onList();
      if (cancelled) return;
      setLoading(false);
      if (res.ok && res.data) setFiles(res.data);
      else setError(res.error ?? `Couldn't load ${providerLabel} files`);
    })();
    return () => {
      cancelled = true;
    };
    // onList/providerLabel are stable for the lifetime of one picker instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected]);

  function loadThumb(item: CloudItem) {
    if (!onThumbnail || item.key in thumbs) return;
    onThumbnail(item).then((res) => {
      setThumbs((prev) => ({ ...prev, [item.key]: res.ok ? (res.data ?? null) : null }));
    });
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function doImport() {
    const items = files.filter((f) => selected.has(f.key));
    if (items.length === 0) return;
    setImporting(true);
    const res = await onImport(items);
    setImporting(false);
    if (res.ok && Array.isArray(res.data) && res.data.length > 0) {
      toast({ title: res.message ?? `${res.data.length} file(s) imported`, tone: "success" });
      onImported(res.data[0]);
      setSelected(new Set());
    } else {
      toast({ title: "Import failed", description: res.error, tone: "error" });
    }
  }

  if (!connected) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
        <div className="mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
          <Cloud size={20} />
        </div>
        <h3 className="text-[15px] font-semibold text-[var(--text)]">{providerLabel} not connected</h3>
        <p className="mx-auto mt-1 max-w-sm text-[13px] text-[var(--text-muted)]">
          Connect your {providerLabel} account to import images and videos directly into your media library or
          composer.
        </p>
        <div className="mt-4">
          <Button size="sm" asChild>
            <a href={connectHref}>Connect {providerLabel} in Integrations</a>
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-12 text-[var(--text-muted)]">
        <Loader2 size={18} className="animate-spin text-[var(--primary)]" />
        <p className="text-[13px]">Loading {providerLabel} files…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--danger)] bg-[var(--danger-soft)] p-5 text-center">
        <AlertCircle size={18} className="mx-auto mb-2 text-[var(--danger)]" />
        <p className="text-[13.5px] text-[var(--text)]">{error}</p>
      </div>
    );
  }

  if (files.length === 0) {
    return <p className="py-10 text-center text-[13.5px] text-[var(--text-muted)]">No images or videos found.</p>;
  }

  return (
    <div>
      <div className="max-h-[420px] space-y-1 overflow-y-auto">
        {files.map((f) => {
          const isSel = selected.has(f.key);
          const thumb = thumbs[f.key];
          return (
            <button
              key={f.key}
              onClick={() => toggle(f.key)}
              onMouseEnter={() => loadThumb(f)}
              className={`flex w-full items-center gap-3 rounded-[var(--radius-md)] border p-2.5 text-left ${
                isSel ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--bg-sunken)] text-[var(--text-subtle)]">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full rounded-[var(--radius-sm)] object-cover" />
                ) : f.isVideo ? (
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
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex items-center justify-between border-t border-[var(--border)] pt-3">
        <span className="text-[12.5px] text-[var(--text-subtle)]">{selected.size} selected</span>
        <Button size="sm" disabled={selected.size === 0 || importing} loading={importing} onClick={doImport}>
          Import {selected.size > 0 ? selected.size : ""} file{selected.size === 1 ? "" : "s"}
        </Button>
      </div>
    </div>
  );
}
