import { describe, it, expect } from "vitest";
import { MAX_BYTES, isBrandingImageKind, validateBrandingImage } from "./upload";
import { DEFAULT_BRANDING_CONFIG, parseBrandingConfig } from "./config";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const bytes = (head: number[], total = 64) => Uint8Array.from([...head, ...new Array(Math.max(0, total - head.length)).fill(0)]);
const text = (s: string) => new TextEncoder().encode(s);

describe("validateBrandingImage", () => {
  it("accepts PNG, JPG and WebP by their real bytes", () => {
    expect(validateBrandingImage("share", bytes(PNG))).toEqual({ ok: true, mime: "image/png" });
    expect(validateBrandingImage("logo", bytes(JPG))).toEqual({ ok: true, mime: "image/jpeg" });
    expect(validateBrandingImage("logo", bytes(WEBP))).toEqual({ ok: true, mime: "image/webp" });
  });

  it("refuses SVG and HTML, even if they were named like an image", () => {
    const svg = validateBrandingImage("logo", text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'));
    expect(svg.ok).toBe(false);
    if (!svg.ok) expect(svg.error).toMatch(/SVG/);
    expect(validateBrandingImage("share", text("<html><body>hi</body></html>")).ok).toBe(false);
  });

  it("refuses formats the networks can't show, videos, PDFs and random bytes", () => {
    expect(validateBrandingImage("share", bytes([0x47, 0x49, 0x46, 0x38])).ok).toBe(false); // GIF
    expect(validateBrandingImage("share", bytes([0x25, 0x50, 0x44, 0x46])).ok).toBe(false); // PDF
    expect(validateBrandingImage("share", text("just some text")).ok).toBe(false);
  });

  it("enforces a size cap per kind, and rejects an empty file", () => {
    expect(validateBrandingImage("logo", bytes(PNG, MAX_BYTES.logo + 1)).ok).toBe(false);
    expect(validateBrandingImage("logo", bytes(PNG, MAX_BYTES.logo)).ok).toBe(true);
    expect(validateBrandingImage("share", bytes(PNG, MAX_BYTES.logo + 1)).ok).toBe(true);
    expect(validateBrandingImage("share", bytes(PNG, MAX_BYTES.share + 1)).ok).toBe(false);
    expect(validateBrandingImage("share", new Uint8Array()).ok).toBe(false);
  });

  it("only knows the two image kinds", () => {
    expect(isBrandingImageKind("share")).toBe(true);
    expect(isBrandingImageKind("logo")).toBe(true);
    expect(isBrandingImageKind("avatar")).toBe(false);
    expect(isBrandingImageKind(undefined)).toBe(false);
  });
});

describe("invoice logo setting", () => {
  it("is empty by default, and takes a site path or https image", () => {
    expect(DEFAULT_BRANDING_CONFIG.invoice.logoUrl).toBe("");
    expect(parseBrandingConfig({ invoice: { logoUrl: "https://cdn.example.com/logo.png" } }).ok).toBe(true);
    expect(parseBrandingConfig({ invoice: { logoUrl: "/uploads/logo.png" } }).ok).toBe(true);
  });

  it("refuses SVG, plain http and script URLs", () => {
    for (const bad of ["https://cdn.example.com/logo.svg", "http://cdn.example.com/logo.png", "javascript:alert(1)", "data:image/png;base64,AAAA"]) {
      expect(parseBrandingConfig({ invoice: { logoUrl: bad } }).ok, bad).toBe(false);
    }
  });
});
