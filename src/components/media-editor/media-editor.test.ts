import { describe, expect, it } from "vitest";
import {
  parseAspectRatio,
  getRotatedDimensions,
  calculateCropRect,
} from "./image-editor";
import { formatTime } from "./video-thumbnail-picker";

describe("Media Editor Math & Geometry", () => {
  describe("parseAspectRatio", () => {
    it("returns 1 for 1:1 square", () => {
      expect(parseAspectRatio("1:1")).toBe(1);
    });

    it("returns 0.8 for 4:5 portrait", () => {
      expect(parseAspectRatio("4:5")).toBeCloseTo(0.8);
    });

    it("returns 16/9 for 16:9 landscape", () => {
      expect(parseAspectRatio("16:9")).toBeCloseTo(16 / 9);
    });

    it("returns 9/16 for 9:16 vertical video", () => {
      expect(parseAspectRatio("9:16")).toBeCloseTo(9 / 16);
    });

    it("returns natural aspect for free preset", () => {
      expect(parseAspectRatio("free", 1920 / 1080)).toBeCloseTo(1920 / 1080);
      expect(parseAspectRatio("free", 4 / 3)).toBeCloseTo(4 / 3);
    });
  });

  describe("getRotatedDimensions", () => {
    it("preserves dimensions on 0 and 180 degrees", () => {
      expect(getRotatedDimensions(1920, 1080, 0)).toEqual({ width: 1920, height: 1080 });
      expect(getRotatedDimensions(1920, 1080, 180)).toEqual({ width: 1920, height: 1080 });
    });

    it("swaps dimensions on 90 and 270 degrees", () => {
      expect(getRotatedDimensions(1920, 1080, 90)).toEqual({ width: 1080, height: 1920 });
      expect(getRotatedDimensions(1920, 1080, 270)).toEqual({ width: 1080, height: 1920 });
    });

    it("handles negative degrees correctly", () => {
      expect(getRotatedDimensions(1920, 1080, -90)).toEqual({ width: 1080, height: 1920 });
      expect(getRotatedDimensions(1920, 1080, -180)).toEqual({ width: 1920, height: 1080 });
    });
  });

  describe("calculateCropRect", () => {
    it("crops a 1920x1080 landscape image into a centered 1:1 square", () => {
      const crop = calculateCropRect(1920, 1080, "1:1", 1.0);
      expect(crop.width).toBe(1080);
      expect(crop.height).toBe(1080);
      expect(crop.y).toBe(0);
      expect(crop.x).toBe((1920 - 1080) / 2); // 420
    });

    it("crops a 1000x2000 portrait image into a centered 1:1 square", () => {
      const crop = calculateCropRect(1000, 2000, "1:1", 1.0);
      expect(crop.width).toBe(1000);
      expect(crop.height).toBe(1000);
      expect(crop.x).toBe(0);
      expect(crop.y).toBe((2000 - 1000) / 2); // 500
    });

    it("crops a 1920x1080 landscape into 16:9 with no change at 1.0 zoom", () => {
      const crop = calculateCropRect(1920, 1080, "16:9", 1.0);
      expect(crop.width).toBe(1920);
      expect(crop.height).toBe(1080);
      expect(crop.x).toBe(0);
      expect(crop.y).toBe(0);
    });

    it("reduces crop rectangle size when zoomed in (2.0x zoom halves dimensions)", () => {
      const crop = calculateCropRect(1000, 1000, "1:1", 2.0);
      expect(crop.width).toBe(500);
      expect(crop.height).toBe(500);
      expect(crop.x).toBe(250);
      expect(crop.y).toBe(250);
    });
  });

  describe("formatTime", () => {
    it("formats 0 seconds", () => {
      expect(formatTime(0)).toBe("00:00.0");
    });

    it("formats seconds with fractional tenths", () => {
      expect(formatTime(14.5)).toBe("00:14.5");
      expect(formatTime(65.2)).toBe("01:05.2");
      expect(formatTime(125.8)).toBe("02:05.8");
    });

    it("handles negative or NaN safely", () => {
      expect(formatTime(-5)).toBe("00:00.0");
      expect(formatTime(NaN)).toBe("00:00.0");
    });
  });
});
