import { describe, it, expect } from "vitest";
import { storageKeyForUrl } from "./storage";

/**
 * deleteAssetAction feeds this to deleteUpload(). A wrong key means the S3/R2
 * object is never removed and the file leaks forever, so the URL → key
 * mapping is pinned here for the URL shapes publicUrl() produces.
 */
describe("storageKeyForUrl", () => {
  it("virtual-host style S3 URL", () => {
    expect(storageKeyForUrl("https://my-bucket.s3.us-east-1.amazonaws.com/uploads/2026/09/abc.jpg")).toBe(
      "uploads/2026/09/abc.jpg",
    );
  });

  it("path style / custom endpoint (R2, MinIO)", () => {
    expect(storageKeyForUrl("https://acct.r2.cloudflarestorage.com/my-bucket/uploads/2026/09/x.png")).toBe(
      "uploads/2026/09/x.png",
    );
  });

  it("public CDN base with the key appended", () => {
    expect(storageKeyForUrl("https://cdn.example.com/uploads/2026/01/v.mp4")).toBe("uploads/2026/01/v.mp4");
  });

  it("local dev path", () => {
    expect(storageKeyForUrl("http://localhost:3000/uploads/x.jpg")).toBe("uploads/x.jpg");
  });

  it("returns null for a URL with no uploads/ segment", () => {
    expect(storageKeyForUrl("https://evil.example.com/etc/passwd")).toBeNull();
    expect(storageKeyForUrl("https://cdn.example.com/other/thing.jpg")).toBeNull();
  });

  it("returns null for junk", () => {
    expect(storageKeyForUrl("not a url")).toBeNull();
    expect(storageKeyForUrl("")).toBeNull();
  });
});
