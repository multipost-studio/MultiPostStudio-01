"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Upload, Search, Image as ImageIcon, Copy, Check, Trash2, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadBlogMediaAction } from "@/app/actions/blog";
import { formatNumber } from "@/lib/utils";

type MediaAssetItem = {
  id: string;
  url: string;
  filename: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  mimeType: string;
  createdAt: Date;
};

export function MediaClient({ initialAssets }: { initialAssets: MediaAssetItem[] }) {
  const router = useRouter();
  const [assets, setAssets] = React.useState(initialAssets);
  const [query, setQuery] = React.useState("");
  const [uploading, setUploading] = React.useState(false);
  const [copiedUrl, setCopiedUrl] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const filtered = assets.filter((a) =>
    a.filename.toLowerCase().includes(query.toLowerCase()),
  );

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadBlogMediaAction(fd);
      if (res.ok && res.file) {
        setAssets([
          {
            id: `temp-${Date.now()}`,
            url: res.file.url,
            filename: res.file.filename,
            sizeBytes: res.file.sizeBytes,
            width: null,
            height: null,
            mimeType: res.file.mimeType,
            createdAt: new Date(),
          },
          ...assets,
        ]);
        router.refresh();
      } else {
        alert(res.error || "Upload failed");
      }
    } finally {
      setUploading(false);
    }
  }

  function handleCopyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  }

  return (
    <div className="space-y-4">
      {/* Upload & Search Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-subtle)]" />
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search images by filename..."
            className="pl-8 text-[13px]"
          />
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
            onChange={handleFileUpload}
            className="hidden"
          />
          <Button
            variant="primary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="gap-1.5 shadow-xs"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            <span>{uploading ? "Uploading..." : "Upload Image"}</span>
          </Button>
        </div>
      </div>

      {/* Grid of Images */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <ImageIcon size={36} className="text-[var(--text-subtle)]" />
          <p className="mt-3 font-medium text-[var(--text)]">No media assets found</p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">Upload images to populate your blog media library.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            className="mt-4 gap-1.5"
          >
            <Upload size={14} />
            <span>Select File</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--surface)] shadow-xs transition-shadow hover:shadow-sm"
            >
              <div className="relative aspect-[4/3] w-full overflow-hidden bg-[var(--surface-hover)]">
                <img
                  src={item.url}
                  alt={item.filename}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              </div>

              <div className="p-2.5">
                <p className="truncate text-[12px] font-medium text-[var(--text)]" title={item.filename}>
                  {item.filename}
                </p>
                <div className="mt-1 flex items-center justify-between text-[11px] text-[var(--text-subtle)]">
                  <span>{formatNumber(Math.round(item.sizeBytes / 1024))} KB</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(item.url)}
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                      title="Copy URL"
                    >
                      {copiedUrl === item.url ? <Check size={12} className="text-[var(--success)]" /> : <Copy size={12} />}
                    </button>
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
                      title="Open full size"
                    >
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
