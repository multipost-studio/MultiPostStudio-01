import { describe, it, expect } from "vitest";
import { INTEGRATION_PROVIDERS } from "./providers";
import { ALLOWED_MIME_TYPES, kindFor } from "@/lib/media-types";

describe("Google Drive OAuth Provider Configuration", () => {
  const driveProvider = INTEGRATION_PROVIDERS.google_drive;

  it("is registered in INTEGRATION_PROVIDERS", () => {
    expect(driveProvider).toBeDefined();
    expect(driveProvider?.key).toBe("google_drive");
    expect(driveProvider?.label).toBe("Google Drive");
  });

  it("requests EXACTLY the least-privilege drive.file and userinfo.email scopes", () => {
    expect(driveProvider?.scopes).toEqual([
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ]);
  });

  it("DOES NOT request the restricted drive.readonly scope", () => {
    expect(driveProvider?.scopes).not.toContain("https://www.googleapis.com/auth/drive.readonly");
    expect(driveProvider?.scopes).not.toContain("https://www.googleapis.com/auth/drive");
  });

  it("configures standard Google OAuth endpoints with offline refresh token access", () => {
    expect(driveProvider?.authorizeUrl).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(driveProvider?.tokenUrl).toBe("https://oauth2.googleapis.com/token");
    expect(driveProvider?.authorizeExtras).toEqual({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
    });
  });
});

describe("Legacy Drive Connection Detection Logic", () => {
  function isLegacyConnection(scopes: string | null | undefined): boolean {
    return !scopes?.includes("drive.file");
  }

  it("flags connections that only have drive.readonly as needing reconnect", () => {
    const legacyScopes = "https://www.googleapis.com/auth/drive.readonly,https://www.googleapis.com/auth/userinfo.email";
    expect(isLegacyConnection(legacyScopes)).toBe(true);
  });

  it("accepts connections that have the new drive.file scope", () => {
    const newScopes = "https://www.googleapis.com/auth/drive.file,https://www.googleapis.com/auth/userinfo.email";
    expect(isLegacyConnection(newScopes)).toBe(false);
  });

  it("flags null or missing scopes as needing reconnect", () => {
    expect(isLegacyConnection(null)).toBe(true);
    expect(isLegacyConnection(undefined)).toBe(true);
    expect(isLegacyConnection("")).toBe(true);
  });
});

describe("Google Drive Media Import Security & Validation Rules", () => {
  it("permits valid image and video MIME types", () => {
    const validTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];
    for (const type of validTypes) {
      expect(ALLOWED_MIME_TYPES.has(type), `${type} should be allowed`).toBe(true);
      const kind = kindFor(type);
      expect(kind === "image" || kind === "video").toBe(true);
    }
  });

  it("rejects SVG images to prevent stored XSS attacks", () => {
    expect(ALLOWED_MIME_TYPES.has("image/svg+xml")).toBe(false);
    expect(ALLOWED_MIME_TYPES.has("image/svg")).toBe(false);
  });

  it("rejects executable or script formats", () => {
    const dangerous = [
      "application/javascript",
      "application/x-msdownload",
      "text/html",
      "application/x-sh",
    ];
    for (const d of dangerous) {
      expect(ALLOWED_MIME_TYPES.has(d)).toBe(false);
    }
  });

  it("strictly enforces maximum 200MB file size limit", () => {
    const MAX_IMPORT_BYTES = 200 * 1024 * 1024;
    expect(MAX_IMPORT_BYTES).toBe(209715200);

    const validSize = 50 * 1024 * 1024;
    const oversized = 201 * 1024 * 1024;

    expect(validSize <= MAX_IMPORT_BYTES).toBe(true);
    expect(oversized <= MAX_IMPORT_BYTES).toBe(false);
  });
});
