import { describe, it, expect, vi } from "vitest";
import { presignUpload, uploadOwnerWorkspace } from "./storage";

vi.mock("@/lib/env", () => ({
  env: { S3_BUCKET: "bucket", S3_REGION: "us-east-1", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_PUBLIC_URL: "https://cdn.example.com" },
  flags: { realStorage: true },
}));
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {},
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn(async () => "https://signed.example.com/put") }));

const WS = "cm1abc2def3ghi4jkl5";

describe("storage keys carry the workspace", () => {
  it("a presigned upload for a workspace lives under uploads/<workspace>/YYYY/MM/", async () => {
    const r = (await presignUpload("photo.png", "image/png", 1000, WS))!;
    expect(r.key).toMatch(new RegExp(`^uploads/${WS}/\\d{4}/\\d{2}/[0-9a-f-]{36}\\.png$`));
    expect(r.publicUrl).toBe(`https://cdn.example.com/${r.key}`);
  });

  it("without a workspace the layout is the old one (platform-level uploads)", async () => {
    const r = (await presignUpload("photo.png", "image/png", 1000))!;
    expect(r.key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
  });

  it("never puts an unexpected value in the path", async () => {
    for (const bad of ["../../etc", "a/b", "UPPER123456", "x y z z z z z z", "short", "a".repeat(80), ""]) {
      const r = (await presignUpload("a.png", "image/png", 10, bad))!;
      expect(r.key).toMatch(/^uploads\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.png$/);
    }
  });

  it("the extension still comes from the verified type, not the file name", async () => {
    const r = (await presignUpload("evil.html", "image/png", 10, WS))!;
    expect(r.key.endsWith(".png")).toBe(true);
  });
});

describe("uploadOwnerWorkspace", () => {
  it("reads the workspace from a prefixed key", () => {
    expect(uploadOwnerWorkspace(`uploads/${WS}/2026/10/abc.png`)).toBe(WS);
  });

  it("is null for older keys, platform uploads and anything that is not one of ours", () => {
    expect(uploadOwnerWorkspace("uploads/2026/10/abc.png")).toBeNull();
    expect(uploadOwnerWorkspace("uploads/abc.png")).toBeNull();
    expect(uploadOwnerWorkspace("uploads/")).toBeNull();
    expect(uploadOwnerWorkspace("thumbnails/123-name.webp")).toBeNull();
    expect(uploadOwnerWorkspace("other/place/file.png")).toBeNull();
  });

  it("does not mistake a path that merely looks like a workspace", () => {
    expect(uploadOwnerWorkspace("uploads/not-a-workspace/2026/10/x.png")).toBeNull();
    expect(uploadOwnerWorkspace(`uploads/${WS}/notayear/x.png`)).toBeNull();
    expect(uploadOwnerWorkspace(`uploads/${WS}`)).toBeNull();
  });
});
