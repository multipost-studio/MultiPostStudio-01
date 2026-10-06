"use client";

import * as React from "react";
import { UploadCloud } from "lucide-react";

/**
 * Drop files anywhere on the page to upload them. Appears only while a FILE is
 * being dragged (internal drag-and-drop such as the calendar's carries no files,
 * so it is never affected), highlights the whole screen in brand orange, and hands
 * the dropped files to the same handler the Upload button uses. Nothing about the
 * upload itself changes.
 */
export function FileDropOverlay({
  enabled = true,
  onFiles,
  title = "Drop to upload",
  hint = "Images and video",
}: {
  enabled?: boolean;
  onFiles: (files: FileList) => void;
  title?: string;
  hint?: string;
}) {
  const [active, setActive] = React.useState(false);
  const depth = React.useRef(0);
  const handler = React.useRef(onFiles);
  React.useEffect(() => {
    handler.current = onFiles;
  }, [onFiles]);

  React.useEffect(() => {
    if (!enabled) return;
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setActive(false);
    };
    const over = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault(); // required for the drop event to fire
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setActive(false);
      if (e.dataTransfer?.files?.length) handler.current(e.dataTransfer.files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      depth.current = 0;
    };
  }, [enabled]);

  if (!enabled || !active) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="mps-swap pointer-events-none fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-[color-mix(in_srgb,var(--primary)_14%,var(--overlay))] p-6 backdrop-blur-[2px]"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-3 rounded-[var(--radius-xl)] border-2 border-dashed border-[var(--primary)] bg-[var(--bg-elevated)] px-8 py-10 text-center shadow-2xl">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)] [animation:mps-float_2.4s_ease-in-out_infinite]">
          <UploadCloud size={28} aria-hidden />
        </span>
        <p className="text-[18px] font-bold text-[var(--text)]">{title}</p>
        <p className="text-[14px] text-[var(--text-muted)]">{hint}</p>
      </div>
    </div>
  );
}
