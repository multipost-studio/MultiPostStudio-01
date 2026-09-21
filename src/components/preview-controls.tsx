"use client";

import * as React from "react";
import { Monitor, Smartphone, Sun, Moon, Grid3X3, Square, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

export type PreviewDevice = "desktop" | "mobile";
export type PreviewTheme = "light" | "dark";
export type PreviewViewMode = "single" | "grid";

export interface PreviewControlsProps {
  device: PreviewDevice;
  onDeviceChange: (device: PreviewDevice) => void;
  theme: PreviewTheme;
  onThemeChange: (theme: PreviewTheme) => void;
  showSafeZone?: boolean;
  onShowSafeZoneChange?: (show: boolean) => void;
  hasVerticalMedia?: boolean;
  viewMode?: PreviewViewMode;
  onViewModeChange?: (mode: PreviewViewMode) => void;
  hasGridSupport?: boolean;
  className?: string;
}

export function PreviewControls({
  device,
  onDeviceChange,
  theme,
  onThemeChange,
  showSafeZone = false,
  onShowSafeZoneChange,
  hasVerticalMedia = false,
  viewMode = "single",
  onViewModeChange,
  hasGridSupport = false,
  className,
}: PreviewControlsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {/* Device Toggle */}
      <div
        role="group"
        aria-label="Preview device"
        className="inline-flex rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-0.5 text-[12px]"
      >
        <button
          type="button"
          onClick={() => onDeviceChange("desktop")}
          aria-pressed={device === "desktop"}
          title="Desktop preview"
          className={cn(
            "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors",
            device === "desktop"
              ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Monitor size={13} />
          <span className="hidden sm:inline">Desktop</span>
        </button>
        <button
          type="button"
          onClick={() => onDeviceChange("mobile")}
          aria-pressed={device === "mobile"}
          title="Mobile preview"
          className={cn(
            "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors",
            device === "mobile"
              ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Smartphone size={13} />
          <span className="hidden sm:inline">Mobile</span>
        </button>
      </div>

      {/* Theme Toggle (Light / Dark) */}
      <div
        role="group"
        aria-label="Preview theme"
        className="inline-flex rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-0.5 text-[12px]"
      >
        <button
          type="button"
          onClick={() => onThemeChange("light")}
          aria-pressed={theme === "light"}
          title="Light theme preview"
          className={cn(
            "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors",
            theme === "light"
              ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Sun size={13} />
          <span className="hidden md:inline">Light</span>
        </button>
        <button
          type="button"
          onClick={() => onThemeChange("dark")}
          aria-pressed={theme === "dark"}
          title="Dark theme preview"
          className={cn(
            "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors",
            theme === "dark"
              ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
              : "text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <Moon size={13} />
          <span className="hidden md:inline">Dark</span>
        </button>
      </div>

      {/* Grid Mode Toggle (Instagram only) */}
      {hasGridSupport && onViewModeChange && (
        <div
          role="group"
          aria-label="Instagram view layout"
          className="inline-flex rounded-[var(--radius-md)] bg-[var(--bg-sunken)] p-0.5 text-[12px]"
        >
          <button
            type="button"
            onClick={() => onViewModeChange("single")}
            aria-pressed={viewMode === "single"}
            title="Single post preview"
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors",
              viewMode === "single"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            <Square size={13} />
            <span className="hidden md:inline">Post</span>
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange("grid")}
            aria-pressed={viewMode === "grid"}
            title="3×3 Profile Grid preview"
            className={cn(
              "flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 font-medium transition-colors",
              viewMode === "grid"
                ? "bg-[var(--surface)] text-[var(--text)] shadow-xs"
                : "text-[var(--text-muted)] hover:text-[var(--text)]",
            )}
          >
            <Grid3X3 size={13} />
            <span className="hidden md:inline">3×3 Grid</span>
          </button>
        </div>
      )}

      {/* Safe Zones Overlay Toggle (Reels / Stories / Shorts / TikTok) */}
      {hasVerticalMedia && onShowSafeZoneChange && (
        <button
          type="button"
          onClick={() => onShowSafeZoneChange(!showSafeZone)}
          aria-pressed={showSafeZone}
          title={showSafeZone ? "Hide safe zone guides" : "Show 9:16 safe zone guides"}
          className={cn(
            "inline-flex items-center gap-1 rounded-[var(--radius-md)] px-2 py-1 text-[12px] font-medium transition-colors",
            showSafeZone
              ? "bg-[var(--primary-soft)] text-[var(--primary)] border border-[var(--primary)]/30 font-semibold"
              : "bg-[var(--bg-sunken)] text-[var(--text-muted)] hover:text-[var(--text)]",
          )}
        >
          <ShieldCheck size={13} />
          <span>Safe Zones</span>
        </button>
      )}
    </div>
  );
}
