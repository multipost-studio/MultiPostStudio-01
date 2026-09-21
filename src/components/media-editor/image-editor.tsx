"use client";

import * as React from "react";
import {
  RotateCw,
  RotateCcw,
  FlipHorizontal,
  FlipVertical,
  ZoomIn,
  ZoomOut,
  Undo,
  Type,
  Crop,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AspectRatioPreset = "free" | "1:1" | "4:5" | "16:9" | "9:16";
export type WatermarkPosition = "bottom-right" | "bottom-left" | "top-right" | "top-left" | "center";

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageEditorProps {
  imageUrl: string;
  filename: string;
  onSave: (file: File) => void | Promise<void>;
  onCancel: () => void;
  loading?: boolean;
}

/** Pure math helper: parse aspect ratio string into numeric ratio width/height. */
export function parseAspectRatio(preset: AspectRatioPreset, naturalAspect = 1): number {
  switch (preset) {
    case "1:1": return 1;
    case "4:5": return 4 / 5;
    case "16:9": return 16 / 9;
    case "9:16": return 9 / 16;
    case "free":
    default:
      return naturalAspect;
  }
}

/** Pure math helper: compute rotated dimensions given angle (0, 90, 180, 270). */
export function getRotatedDimensions(width: number, height: number, rotation: number): { width: number; height: number } {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90 || normalized === 270) {
    return { width: height, height: width };
  }
  return { width, height };
}

/** Pure math helper: calculate centered crop box inside image dimensions for a target aspect ratio and zoom. */
export function calculateCropRect(
  sourceWidth: number,
  sourceHeight: number,
  preset: AspectRatioPreset,
  zoom = 1.0,
): CropRect {
  const naturalAspect = sourceWidth / sourceHeight;
  const targetAspect = parseAspectRatio(preset, naturalAspect);

  let baseWidth: number;
  let baseHeight: number;

  if (targetAspect > naturalAspect) {
    // Limited by width
    baseWidth = sourceWidth;
    baseHeight = sourceWidth / targetAspect;
  } else {
    // Limited by height
    baseHeight = sourceHeight;
    baseWidth = sourceHeight * targetAspect;
  }

  // Apply zoom factor (zooming in shrinks the crop area in source space)
  const clampedZoom = Math.max(1.0, Math.min(zoom, 3.0));
  const finalWidth = Math.max(1, Math.round(baseWidth / clampedZoom));
  const finalHeight = Math.max(1, Math.round(baseHeight / clampedZoom));

  const x = Math.max(0, Math.round((sourceWidth - finalWidth) / 2));
  const y = Math.max(0, Math.round((sourceHeight - finalHeight) / 2));

  return { x, y, width: finalWidth, height: finalHeight };
}

export function ImageEditor({
  imageUrl,
  filename,
  onSave,
  onCancel,
  loading = false,
}: ImageEditorProps) {
  const [aspect, setAspect] = React.useState<AspectRatioPreset>("free");
  const [rotation, setRotation] = React.useState<number>(0);
  const [flipH, setFlipH] = React.useState<boolean>(false);
  const [flipV, setFlipV] = React.useState<boolean>(false);
  const [zoom, setZoom] = React.useState<number>(1.0);
  const [watermarkText, setWatermarkText] = React.useState<string>("");
  const [watermarkPos, setWatermarkPos] = React.useState<WatermarkPosition>("bottom-right");
  const [showWatermarkInput, setShowWatermarkInput] = React.useState(false);
  const [imgLoaded, setImgLoaded] = React.useState(false);
  const [naturalSize, setNaturalSize] = React.useState<{ width: number; height: number }>({ width: 800, height: 600 });

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const imageRef = React.useRef<HTMLImageElement | null>(null);

  // Load the image into an HTMLImageElement
  React.useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
      setImgLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  // Re-draw preview canvas whenever editing parameters change
  React.useEffect(() => {
    if (!imgLoaded || !imageRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imageRef.current;
    const { width: srcW, height: srcH } = naturalSize;

    // First, determine effective orientation dimensions
    const rotated = getRotatedDimensions(srcW, srcH, rotation);

    // Calculate crop rectangle on the rotated bounds
    const crop = calculateCropRect(rotated.width, rotated.height, aspect, zoom);

    // Set canvas dimensions to crop dimensions, scaled down for preview display
    const maxPreviewDim = 600;
    const scale = Math.min(1, maxPreviewDim / Math.max(crop.width, crop.height));
    canvas.width = Math.round(crop.width * scale);
    canvas.height = Math.round(crop.height * scale);

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);

    // Transform coordinate system so crop center is at canvas center
    ctx.translate(-crop.x, -crop.y);

    // Apply rotation and flip around the center of the rotated space
    const centerX = rotated.width / 2;
    const centerY = rotated.height / 2;

    ctx.translate(centerX, centerY);
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);

    // Draw original image centered
    ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
    ctx.restore();

    // Render watermark if provided
    if (watermarkText.trim()) {
      ctx.save();
      const fontSize = Math.max(12, Math.round(canvas.height * 0.04));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "middle";

      const padding = Math.round(fontSize * 0.5);
      const metrics = ctx.measureText(watermarkText);
      const textW = metrics.width;
      const textH = fontSize;

      let wx = canvas.width - textW - padding * 2;
      let wy = canvas.height - textH / 2 - padding;

      if (watermarkPos === "bottom-left") {
        wx = padding;
        wy = canvas.height - textH / 2 - padding;
      } else if (watermarkPos === "top-right") {
        wx = canvas.width - textW - padding * 2;
        wy = textH / 2 + padding;
      } else if (watermarkPos === "top-left") {
        wx = padding;
        wy = textH / 2 + padding;
      } else if (watermarkPos === "center") {
        wx = (canvas.width - textW) / 2;
        wy = canvas.height / 2;
      }

      // Draw subtle dark background pill
      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.roundRect(wx - padding / 2, wy - textH / 2 - 2, textW + padding, textH + 6, 4);
      ctx.fill();

      // Draw white text
      ctx.fillStyle = "#ffffff";
      ctx.fillText(watermarkText, wx, wy);
      ctx.restore();
    }
  }, [imgLoaded, naturalSize, aspect, rotation, flipH, flipV, zoom, watermarkText, watermarkPos]);

  function handleReset() {
    setAspect("free");
    setRotation(0);
    setFlipH(false);
    setFlipV(false);
    setZoom(1.0);
    setWatermarkText("");
    setShowWatermarkInput(false);
  }

  async function handleExportAndSave() {
    if (!imageRef.current) return;
    const img = imageRef.current;
    const { width: srcW, height: srcH } = naturalSize;
    const rotated = getRotatedDimensions(srcW, srcH, rotation);
    const crop = calculateCropRect(rotated.width, rotated.height, aspect, zoom);

    // Render high-resolution export canvas
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = crop.width;
    exportCanvas.height = crop.height;
    const ctx = exportCanvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.translate(-crop.x, -crop.y);
    const centerX = rotated.width / 2;
    const centerY = rotated.height / 2;

    ctx.translate(centerX, centerY);
    if (rotation !== 0) ctx.rotate((rotation * Math.PI) / 180);
    if (flipH) ctx.scale(-1, 1);
    if (flipV) ctx.scale(1, -1);
    ctx.drawImage(img, -srcW / 2, -srcH / 2, srcW, srcH);
    ctx.restore();

    // Render watermark at full resolution
    if (watermarkText.trim()) {
      ctx.save();
      const fontSize = Math.max(16, Math.round(exportCanvas.height * 0.035));
      ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = "middle";

      const padding = Math.round(fontSize * 0.5);
      const metrics = ctx.measureText(watermarkText);
      const textW = metrics.width;
      const textH = fontSize;

      let wx = exportCanvas.width - textW - padding * 2;
      let wy = exportCanvas.height - textH / 2 - padding;

      if (watermarkPos === "bottom-left") {
        wx = padding;
        wy = exportCanvas.height - textH / 2 - padding;
      } else if (watermarkPos === "top-right") {
        wx = exportCanvas.width - textW - padding * 2;
        wy = textH / 2 + padding;
      } else if (watermarkPos === "top-left") {
        wx = padding;
        wy = textH / 2 + padding;
      } else if (watermarkPos === "center") {
        wx = (exportCanvas.width - textW) / 2;
        wy = exportCanvas.height / 2;
      }

      ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
      ctx.beginPath();
      ctx.roundRect(wx - padding / 2, wy - textH / 2 - 3, textW + padding, textH + 8, 6);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(watermarkText, wx, wy);
      ctx.restore();
    }

    // Convert to Blob and File
    exportCanvas.toBlob(
      (blob) => {
        if (!blob) return;
        const ext = filename.split(".").pop() || "jpg";
        const baseName = filename.replace(/\.[^/.]+$/, "");
        const newFilename = `${baseName}-edited.${ext === "png" ? "png" : "jpg"}`;
        const file = new File([blob], newFilename, { type: blob.type });
        onSave(file);
      },
      "image/jpeg",
      0.92,
    );
  }

  const presets: { label: string; value: AspectRatioPreset }[] = [
    { label: "Original", value: "free" },
    { label: "1:1 Square", value: "1:1" },
    { label: "4:5 Portrait", value: "4:5" },
    { label: "16:9 Landscape", value: "16:9" },
    { label: "9:16 Story/Reel", value: "9:16" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Top Toolbar: Aspect Ratio Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] pb-3">
        <div className="flex items-center gap-1 text-[13px] font-medium text-[var(--text-muted)]">
          <Crop size={15} />
          <span>Crop:</span>
        </div>
        <div className="flex flex-wrap gap-1 rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-1 text-[12px]">
          {presets.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setAspect(p.value)}
              className={cn(
                "rounded-[var(--radius-sm)] px-2.5 py-1 font-medium transition-colors",
                aspect === p.value
                  ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text)]",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="relative flex min-h-[320px] max-h-[460px] items-center justify-center overflow-hidden rounded-[var(--radius-lg)] border border-[var(--border)] bg-neutral-950 p-4">
        {!imgLoaded && (
          <div className="text-[13px] text-neutral-400">Loading image for editing…</div>
        )}
        <canvas
          ref={canvasRef}
          className="max-h-[420px] max-w-full rounded shadow-lg object-contain"
        />
      </div>

      {/* Secondary Toolbar: Rotation, Flip, Zoom, Watermark */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-[var(--border)] pt-3 text-[13px]">
        {/* Transform Actions */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            title="Rotate 90° CCW"
            onClick={() => setRotation((r) => (r - 90 + 360) % 360)}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <RotateCcw size={15} />
          </button>
          <button
            type="button"
            title="Rotate 90° CW"
            onClick={() => setRotation((r) => (r + 90) % 360)}
            className="rounded-[var(--radius-sm)] border border-[var(--border)] p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <RotateCw size={15} />
          </button>
          <button
            type="button"
            title="Flip Horizontal"
            onClick={() => setFlipH((f) => !f)}
            className={cn(
              "rounded-[var(--radius-sm)] border border-[var(--border)] p-1.5 transition-colors",
              flipH
                ? "bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary)]/40"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <FlipHorizontal size={15} />
          </button>
          <button
            type="button"
            title="Flip Vertical"
            onClick={() => setFlipV((f) => !f)}
            className={cn(
              "rounded-[var(--radius-sm)] border border-[var(--border)] p-1.5 transition-colors",
              flipV
                ? "bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary)]/40"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <FlipVertical size={15} />
          </button>
        </div>

        {/* Zoom Slider */}
        <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
          <ZoomOut size={14} />
          <input
            type="range"
            min="1.0"
            max="2.5"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="h-1.5 w-24 cursor-pointer accent-[var(--primary)]"
            title={`Zoom: ${Math.round(zoom * 100)}%`}
          />
          <ZoomIn size={14} />
          <span className="w-8 tabular-nums">{Math.round(zoom * 100)}%</span>
        </div>

        {/* Watermark & Reset */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowWatermarkInput((v) => !v)}
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-[12px] font-medium transition-colors",
              watermarkText || showWatermarkInput
                ? "bg-[var(--primary-soft)] text-[var(--primary)] border-[var(--primary)]/30"
                : "text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]",
            )}
          >
            <Type size={13} />
            <span>Watermark</span>
          </button>

          <button
            type="button"
            onClick={handleReset}
            title="Reset edits"
            className="flex items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--border)] px-2 py-1 text-[12px] text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]"
          >
            <Undo size={12} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Expandable Watermark Settings */}
      {showWatermarkInput && (
        <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--bg-sunken)] p-2.5 text-[12px]">
          <input
            type="text"
            value={watermarkText}
            onChange={(e) => setWatermarkText(e.target.value)}
            placeholder="Watermark text (e.g. @brand or company name)…"
            className="h-8 flex-1 min-w-[180px] rounded-[var(--radius-sm)] border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[12.5px] text-[var(--text)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <div className="flex items-center gap-1">
            {(["bottom-right", "bottom-left", "top-right", "center"] as const).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => setWatermarkPos(pos)}
                className={cn(
                  "rounded px-2 py-1 capitalize text-[11px]",
                  watermarkPos === pos
                    ? "bg-[var(--primary)] text-white font-medium"
                    : "bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)]",
                )}
              >
                {pos.replace("-", " ")}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Modal Actions */}
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="sm"
          loading={loading}
          onClick={handleExportAndSave}
          className="gap-1.5"
        >
          <Check size={14} />
          Save Changes
        </Button>
      </div>
    </div>
  );
}
