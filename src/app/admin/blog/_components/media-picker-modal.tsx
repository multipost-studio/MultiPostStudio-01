"use client";

import * as React from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Upload, Image as ImageIcon, Link as LinkIcon, AlertCircle, Check, Loader2, X } from "lucide-react";
import { uploadBlogMediaAction } from "@/app/actions/blog";
import { cn } from "@/lib/utils";

export function MediaPickerModal({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (media: { url: string; altText?: string; filename?: string }) => void;
}) {
  const [tab, setTab] = React.useState<"upload" | "url">("upload");
  const [uploading, setUploading] = React.useState(false);
  const [customUrl, setCustomUrl] = React.useState("");
  const [altText, setAltText] = React.useState("");
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const [isDragOver, setIsDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Clean preview blob URL on unmount or file change
  React.useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith("blob:")) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChosen(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file (PNG, JPG, WebP, GIF, or SVG).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File exceeds maximum allowed size of 10MB.");
      return;
    }

    setError(null);
    setSelectedFile(file);
    if (!altText) {
      // Auto-suggest alt text from file name
      const cleanName = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .trim();
      setAltText(cleanName);
    }
    const blob = URL.createObjectURL(file);
    setPreviewUrl(blob);
  }

  async function handleUploadAndInsert() {
    if (!selectedFile) {
      setError("Please select an image to upload.");
      return;
    }

    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      const res = await uploadBlogMediaAction(fd);
      if (res.ok && res.file) {
        onSelect({
          url: res.file.url,
          altText: altText.trim() || res.file.filename,
          filename: res.file.filename,
        });
        resetAndClose();
      } else {
        setError(res.error || "Upload failed. Please try again.");
      }
    } catch {
      setError("Upload failed due to a network or server issue.");
    } finally {
      setUploading(false);
    }
  }

  function handleCustomUrlSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const trimmed = customUrl.trim();
    if (!trimmed) {
      setError("Please enter a valid image URL.");
      return;
    }
    onSelect({ url: trimmed, altText: altText.trim() });
    resetAndClose();
  }

  function resetAndClose() {
    setSelectedFile(null);
    setPreviewUrl(null);
    setCustomUrl("");
    setAltText("");
    setError(null);
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      title="Insert Image"
      description="Add visual media to your article from local files or an external web URL."
      size="md"
      footer={
        <div className="flex w-full items-center justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={resetAndClose}
            disabled={uploading}
          >
            Cancel
          </Button>

          {tab === "upload" ? (
            <Button
              size="sm"
              variant="primary"
              onClick={handleUploadAndInsert}
              loading={uploading}
              disabled={!selectedFile || uploading}
            >
              <Check size={15} className="mr-1.5" />
              Upload & Insert
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              onClick={() => handleCustomUrlSubmit()}
              disabled={!customUrl.trim()}
            >
              <Check size={15} className="mr-1.5" />
              Insert Image
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        {/* Segmented Tab Switcher */}
        <div className="flex items-center rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--bg-sunken)] p-1 text-[13px]">
          <button
            type="button"
            onClick={() => {
              setTab("upload");
              setError(null);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 font-medium transition-all",
              tab === "upload"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            <Upload size={14} />
            <span>Upload File</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab("url");
              setError(null);
            }}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-sm)] py-1.5 font-medium transition-all",
              tab === "url"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]"
            )}
          >
            <LinkIcon size={14} />
            <span>Image URL</span>
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--danger)]/30 bg-[var(--danger-soft)] p-2.5 text-[12.5px] text-[var(--danger)]">
            <AlertCircle size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Alt Text Field */}
        <div>
          <label className="flex items-center justify-between text-[12px] font-medium text-[var(--text)]">
            <span>Alt text (Accessibility & SEO)</span>
            <span className="text-[11px] text-[var(--text-subtle)]">Recommended</span>
          </label>
          <input
            type="text"
            value={altText}
            onChange={(e) => setAltText(e.target.value)}
            placeholder="Briefly describe what this image shows..."
            className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>

        {/* Upload Mode */}
        {tab === "upload" ? (
          <div>
            {previewUrl ? (
              <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-[var(--border-strong)] bg-[var(--surface)] p-3">
                <div className="relative flex aspect-video max-h-48 w-full items-center justify-center overflow-hidden rounded-[var(--radius-sm)] bg-[var(--bg-sunken)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={altText || "Preview"}
                    className="max-h-full max-w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                    }}
                    className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                    title="Remove selected file"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[12px] text-[var(--text-muted)]">
                  <span className="max-w-[240px] truncate font-medium text-[var(--text)]">
                    {selectedFile?.name}
                  </span>
                  <span>
                    {selectedFile ? (selectedFile.size / 1024 / 1024).toFixed(2) + " MB" : ""}
                  </span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragOver(true);
                }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleFileChosen(f);
                }}
                className={cn(
                  "flex cursor-pointer flex-col items-center justify-center rounded-[var(--radius-md)] border-2 border-dashed p-6 text-center transition-all",
                  isDragOver
                    ? "border-[var(--primary)] bg-[var(--primary-soft)]"
                    : "border-[var(--border-strong)] bg-[var(--surface)] hover:border-[var(--primary)] hover:bg-[var(--surface-hover)]"
                )}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFileChosen(f);
                  }}
                  className="hidden"
                />

                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--primary-soft)] text-[var(--primary)]">
                  <Upload size={20} />
                </div>
                <p className="mt-2.5 text-[13.5px] font-semibold text-[var(--text)]">
                  Click to choose or drag & drop image
                </p>
                <p className="mt-0.5 text-[11.5px] text-[var(--text-subtle)]">
                  PNG, JPG, WebP, GIF, or SVG (up to 10MB)
                </p>
              </div>
            )}
          </div>
        ) : (
          /* URL Mode */
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] font-medium text-[var(--text)]">External Image URL</label>
              <input
                type="url"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://example.com/photo.jpg"
                className="mt-1 w-full rounded-[var(--radius-sm)] border border-[var(--border-strong)] bg-[var(--surface)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--text-subtle)] transition-colors focus:border-[var(--primary)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                required
              />
            </div>

            {customUrl.trim().startsWith("http") && (
              <div className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-2">
                <p className="mb-1.5 text-[11px] font-medium text-[var(--text-subtle)]">Preview:</p>
                <div className="flex max-h-36 items-center justify-center overflow-hidden rounded bg-[var(--bg-sunken)] p-1">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={customUrl.trim()}
                    alt={altText || "URL preview"}
                    className="max-h-32 max-w-full object-contain"
                    onError={() => setError("Unable to load preview from this URL. Please verify the link.")}
                    onLoad={() => setError(null)}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
