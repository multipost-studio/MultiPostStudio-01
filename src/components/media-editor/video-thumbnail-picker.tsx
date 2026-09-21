"use client";

import * as React from "react";
import { Play, Pause, ChevronLeft, ChevronRight, Check, Film, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface VideoThumbnailPickerProps {
  videoUrl: string;
  filename: string;
  onSave: (file: File) => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "00:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const tenths = Math.round((seconds % 1) * 10) % 10;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${tenths}`;
}

export function VideoThumbnailPicker({
  videoUrl,
  filename,
  onSave,
  onCancel,
  loading = false,
}: VideoThumbnailPickerProps) {
  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = React.useState<number>(0);
  const [currentTime, setCurrentTime] = React.useState<number>(0);
  const [isPlaying, setIsPlaying] = React.useState<boolean>(false);
  const [isLoaded, setIsLoaded] = React.useState<boolean>(false);

  // Sync current time from video playback
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration || 10);
      setIsLoaded(true);
      // Seek to 1 second or 10% initially to avoid a black opening frame
      const initialSeek = Math.min(1.0, (videoRef.current.duration || 0) * 0.1);
      videoRef.current.currentTime = initialSeek;
      setCurrentTime(initialSeek);
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const seekTo = (time: number) => {
    if (!videoRef.current) return;
    const clamped = Math.max(0, Math.min(time, duration));
    videoRef.current.currentTime = clamped;
    setCurrentTime(clamped);
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const captureFrame = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const baseName = filename.replace(/\.[^/.]+$/, "");
        const thumbFilename = `${baseName}-thumbnail.jpg`;
        const file = new File([blob], thumbFilename, { type: "image/jpeg" });
        onSave(file);
      },
      "image/jpeg",
      0.92,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2.5 text-[13px]">
        <div className="flex items-center gap-1.5 font-medium text-[var(--text)]">
          <Film size={16} className="text-[var(--primary)]" />
          <span>Select Video Thumbnail Frame</span>
        </div>
        <div className="flex items-center gap-1 text-[12px] text-[var(--text-muted)]">
          <Clock size={13} />
          <span className="font-mono tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* Video Preview Canvas Container */}
      <div className="relative flex max-h-[380px] min-h-[240px] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-black">
        <video
          ref={videoRef}
          src={videoUrl}
          playsInline
          crossOrigin="anonymous"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          className="max-h-[380px] w-full object-contain"
        />
        {!isLoaded && (
          <div className="absolute inset-0 flex items-center justify-center text-[13px] text-white/60">
            Loading video stream…
          </div>
        )}
      </div>

      {/* Frame Scrubber Slider */}
      <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-3">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min="0"
            max={duration || 10}
            step="0.05"
            value={currentTime}
            onChange={(e) => seekTo(parseFloat(e.target.value))}
            className="h-2 flex-1 cursor-pointer accent-[var(--primary)]"
            title="Scrub video timeline"
          />
        </div>

        {/* Play & Precision Stepping Controls */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[12px]">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={togglePlay}
              className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 font-medium text-[var(--text)] hover:bg-[var(--surface-hover)]"
            >
              {isPlaying ? <Pause size={13} fill="currentColor" /> : <Play size={13} fill="currentColor" />}
              <span>{isPlaying ? "Pause" : "Play"}</span>
            </button>

            <button
              type="button"
              onClick={() => seekTo(currentTime - 1.0)}
              title="Back 1 second"
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              -1s
            </button>
            <button
              type="button"
              onClick={() => seekTo(currentTime - 0.1)}
              title="Back 1 frame (0.1s)"
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              type="button"
              onClick={() => seekTo(currentTime + 0.1)}
              title="Forward 1 frame (0.1s)"
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] p-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              <ChevronRight size={14} />
            </button>
            <button
              type="button"
              onClick={() => seekTo(currentTime + 1.0)}
              title="Forward 1 second"
              className="rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            >
              +1s
            </button>
          </div>

          <p className="text-[11.5px] text-[var(--text-subtle)]">
            Frame at <span className="font-mono">{formatTime(currentTime)}</span> will be saved as thumbnail
          </p>
        </div>
      </div>

      {/* Modal Actions */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={captureFrame}
          className="gap-1.5"
        >
          <Check size={14} />
          Capture & Save Thumbnail
        </Button>
      </div>
    </div>
  );
}
