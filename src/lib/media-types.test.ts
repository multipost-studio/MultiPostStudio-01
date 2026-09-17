import { describe, expect, it } from "vitest";
import { extensionForMime, sniffMimeType } from "@/lib/media-types";

const u8 = (arr: number[]) => new Uint8Array(arr);

describe("sniffMimeType", () => {
  it("detects common image formats", () => {
    expect(sniffMimeType(u8([0xff, 0xd8, 0xff, 0xe0, 0, 0]))).toBe("image/jpeg");
    expect(sniffMimeType(u8([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffMimeType(u8([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("image/gif");
    // RIFF....WEBP
    expect(sniffMimeType(u8([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("detects video containers and pdf", () => {
    // ....ftypisom
    expect(sniffMimeType(u8([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]))).toBe("video/mp4");
    // ....ftypqt
    expect(sniffMimeType(u8([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]))).toBe(
      "video/quicktime",
    );
    // EBML header
    expect(sniffMimeType(u8([0x1a, 0x45, 0xdf, 0xa3, 0x93, 0x42, 0x82]))).toBe("video/webm");
    expect(sniffMimeType(u8([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe("application/pdf");
  });

  it("exposes scriptable formats instead of hiding them", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg">');
    expect(sniffMimeType(svg)).toBe("image/svg+xml");
    const html = new TextEncoder().encode("<!DOCTYPE html><html>");
    expect(sniffMimeType(html)).toBe("text/html");
  });

  it("returns null for unknown bytes", () => {
    expect(sniffMimeType(u8([0, 1, 2, 3, 4, 5]))).toBeNull();
    expect(sniffMimeType(u8([]))).toBeNull();
  });
});

describe("extensionForMime", () => {
  it("maps allowlisted types to safe extensions", () => {
    expect(extensionForMime("image/jpeg")).toBe("jpg");
    expect(extensionForMime("video/quicktime")).toBe("mov");
    expect(extensionForMime("video/x-matroska")).toBe("mkv");
    expect(extensionForMime("application/pdf")).toBe("pdf");
  });

  it("never yields an executable extension", () => {
    expect(extensionForMime("image/svg+xml")).toBe("bin");
    expect(extensionForMime("text/html")).toBe("bin");
  });
});
