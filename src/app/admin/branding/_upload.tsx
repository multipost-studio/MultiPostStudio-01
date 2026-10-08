"use client";

import * as React from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadBrandingImageAction } from "@/app/actions/admin-branding";
import { ALLOWED_IMAGE_TYPES, KIND_LABEL, MAX_BYTES, type BrandingImageKind } from "@/lib/branding/upload";
import { cn } from "@/lib/utils";

const MB = 1024 * 1024;

/**
 * Upload button with drag-and-drop, a thumbnail of the current image, and a remove
 * button. It checks type and size before sending (the server checks again against the
 * file's real bytes), and only fills the field: nothing goes live until Save all.
 */
export function ImageUpload({
  kind,
  value,
  onChange,
  previewClassName,
}: {
  kind: BrandingImageKind;
  value: string;
  onChange: (url: string) => void;
  previewClassName?: string;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [drag, setDrag] = React.useState(false);

  async function send(file: File) {
    setError("");
    if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) return setError("Upload a PNG, JPG or WebP image.");
    if (file.size > MAX_BYTES[kind]) return setError(`That ${KIND_LABEL[kind]} is ${(file.size / MB).toFixed(1)} MB. The limit is ${MAX_BYTES[kind] / MB} MB.`);
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await uploadBrandingImageAction(kind, fd);
      if (res.ok) onChange(res.url);
      else setError(res.error);
    } catch {
      setError("The upload didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void send(f);
        }}
        className={cn(
          "flex flex-wrap items-center gap-4 rounded-[var(--radius-lg)] border border-dashed p-4 transition-colors",
          drag ? "border-[var(--primary)] bg-[var(--primary-soft)]" : "border-[var(--border-strong)] bg-[var(--bg-sunken)]",
        )}
      >
        <div className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--surface)]", previewClassName ?? "h-16 w-28")}>
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt="" className="h-full w-full object-contain p-1" />
          ) : (
            <ImagePlus size={22} aria-hidden className="text-[var(--text-subtle)]" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-medium text-[var(--text)]">{value ? `Current ${KIND_LABEL[kind]}` : `No ${KIND_LABEL[kind]} uploaded`}</p>
          <p className="text-[12.5px] text-[var(--text-muted)]">Drop an image here, or choose one. PNG, JPG or WebP, up to {MAX_BYTES[kind] / MB} MB.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
              {busy ? <Loader2 size={13} aria-hidden className="animate-spin" /> : <ImagePlus size={13} aria-hidden />} {busy ? "Uploading…" : value ? "Replace image" : "Upload image"}
            </Button>
            {value && !busy && (
              <Button size="sm" variant="ghost" onClick={() => onChange("")}>
                <Trash2 size={13} aria-hidden /> Remove
              </Button>
            )}
          </div>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_IMAGE_TYPES.join(",")}
          className="sr-only"
          aria-label={`Upload ${KIND_LABEL[kind]}`}
          onChange={(e) => e.target.files?.[0] && void send(e.target.files[0])}
        />
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
