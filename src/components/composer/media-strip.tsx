"use client";

import * as React from "react";
import { ImageIcon, Play, Plus, X } from "lucide-react";

/**
 * The post's media, inside the editor card right under the text: thumbnails with a remove button, and one tile to add more
 * (drag files onto it, click to choose a file, or open the library). Alt text and editing live in a collapsed list below it,
 * so a first-time user sees what is attached and one obvious way to add more.
 */

type Item = { id: string; url: string; thumbUrl: string | null; kind: string; filename: string };

export function MediaStrip({
  media,
  locked,
  uploading,
  onFiles,
  onLibrary,
  onRemove,
}: {
  media: Item[];
  locked: boolean;
  uploading: boolean;
  onFiles: (files: File[]) => void;
  onLibrary: () => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [over, setOver] = React.useState(false);

  function pick(list: FileList | null) {
    const files = list ? Array.from(list) : [];
    if (inputRef.current) inputRef.current.value = "";
    if (files.length > 0) onFiles(files);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 pb-2">
      {media.map((m) => {
        const isVideo = m.kind === "video";
        const still = m.thumbUrl ?? (isVideo ? null : m.url);
        return (
          <div key={m.id} className="group relative h-[88px] w-[88px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-black">
            {still ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={still} alt={m.filename} className="h-full w-full object-cover" />
            ) : (
              <video src={`${m.url}#t=0.1`} preload="metadata" muted playsInline aria-label={m.filename} className="h-full w-full object-cover" />
            )}
            {isVideo && (
              <span className="pointer-events-none absolute bottom-1 left-1 grid h-5 w-5 place-items-center rounded-full bg-black/60 text-white">
                <Play size={10} fill="currentColor" className="translate-x-[0.5px]" />
              </span>
            )}
            {!locked && (
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                aria-label={`Remove ${m.filename}`}
                className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/65 text-white opacity-90 hover:bg-black/80 focus-visible:outline-2 focus-visible:outline-[var(--ring)]"
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}

      {!locked && (
        <>
          <input ref={inputRef} type="file" multiple accept="image/*,video/*" className="hidden" onChange={(e) => pick(e.target.files)} />
          <button
            type="button"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              pick(e.dataTransfer.files);
            }}
            aria-label="Add photos or videos"
            className={`flex h-[88px] min-w-[120px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border border-dashed px-3 text-center text-[12px] transition-colors disabled:opacity-60 ${over ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--text)]" : "border-[var(--border-strong)] text-[var(--text-muted)] hover:border-[var(--primary)] hover:bg-[var(--surface-hover)]"}`}
          >
            {uploading ? (
              <span>Uploading…</span>
            ) : (
              <>
                <Plus size={16} aria-hidden="true" />
                <span>
                  Drag &amp; drop or <span className="font-medium text-[var(--primary)]">select a file</span>
                </span>
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onLibrary}
            className="inline-flex h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-[12.5px] font-medium text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <ImageIcon size={13} aria-hidden="true" /> From library
          </button>
        </>
      )}

      {locked && media.length === 0 && <p className="text-[12.5px] text-[var(--text-subtle)]">No media attached.</p>}
    </div>
  );
}
