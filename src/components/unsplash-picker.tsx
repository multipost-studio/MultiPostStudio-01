"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { searchUnsplashAction, importUnsplashAction } from "@/app/actions/media";

type Photo = {
  id: string;
  thumb: string;
  small: string;
  regular: string;
  alt: string;
  creditName: string;
  creditUrl: string;
  downloadLocation: string;
};

/**
 * Unsplash search + import. Clicking a result downloads it into the
 * workspace's media library and calls `onImported` with the new asset id.
 */
export function UnsplashPicker({
  folderId = null,
  onImported,
}: {
  folderId?: string | null;
  onImported: (assetId: string) => void;
}) {
  const { toast } = useToast();
  const [q, setQ] = React.useState("");
  const [photos, setPhotos] = React.useState<Photo[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [importing, setImporting] = React.useState<string | null>(null);

  const term = q.trim();
  const active = term.length >= 2;

  React.useEffect(() => {
    if (term.length < 2) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchUnsplashAction(term, 1);
      if (cancelled) return;
      setLoading(false);
      if (res.ok && res.data) setPhotos(res.data.results as Photo[]);
      else if (!res.ok) toast({ title: res.error ?? "Search failed", tone: "error" });
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [term, toast]);

  async function pick(p: Photo) {
    setImporting(p.id);
    const res = await importUnsplashAction({
      id: p.id,
      regular: p.regular,
      downloadLocation: p.downloadLocation,
      alt: p.alt,
      creditName: p.creditName,
      creditUrl: p.creditUrl,
      folderId,
    });
    setImporting(null);
    if (res.ok && typeof res.data === "string") {
      toast({ title: "Photo added", tone: "success" });
      onImported(res.data);
    } else {
      toast({ title: res.error ?? "Import failed", tone: "error" });
    }
  }

  return (
    <div>
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Unsplash — e.g. “team meeting”, “sunset”, “coffee”"
          className="pl-9"
        />
      </div>

      {loading && <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">Searching…</p>}

      {!loading && active && photos.length === 0 && (
        <p className="py-6 text-center text-[13px] text-[var(--text-muted)]">No photos for “{term}”.</p>
      )}

      {active && photos.length > 0 && (
        <div className="grid max-h-[420px] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          {photos.map((p) => (
            <button
              key={p.id}
              onClick={() => pick(p)}
              disabled={importing !== null}
              className="group relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] disabled:opacity-60"
              title={`Photo by ${p.creditName} on Unsplash`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={p.alt} className="aspect-square w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
                {p.creditName}
              </span>
              {importing === p.id && (
                <span className="absolute inset-0 grid place-items-center bg-black/40 text-[11px] font-medium text-white">
                  Adding…
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11px] text-[var(--text-subtle)]">
        Photos from{" "}
        <a href="https://unsplash.com" target="_blank" rel="noreferrer" className="underline">
          Unsplash
        </a>
        . The photographer is credited automatically in the asset&apos;s description.
      </p>
    </div>
  );
}
