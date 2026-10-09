import { describe, it, expect, vi, beforeEach } from "vitest";
import { uploadBrandingImageAction } from "./admin-branding";
import { requirePlatformAdmin } from "@/lib/session";
import { saveUpload } from "@/lib/adapters/storage";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { logAudit } from "@/lib/events";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn() }));
vi.mock("@/lib/session", () => {
  // one function for both guards: the actions now ask for a named permission, the tests only care whether the caller is an admin
  const guard = vi.fn();
  return { requirePlatformAdmin: guard, requireAdminPermission: guard };
});
vi.mock("@/lib/branding/store", () => ({ BRANDING_CONFIG_KEY: "site_branding", loadBranding: vi.fn(), saveBranding: vi.fn(), resetBranding: vi.fn() }));
vi.mock("@/lib/adapters/storage", () => ({ saveUpload: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: vi.fn(),
  RateLimitError: class RateLimitError extends Error {
    constructor(public resetAt: number) {
      super("Too many requests — please slow down and try again shortly.");
    }
  },
}));

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0];
const form = (bytes: number[], name = "logo.png", type = "image/png") => {
  const fd = new FormData();
  fd.set("file", new File([Uint8Array.from(bytes)], name, { type }));
  return fd;
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({ id: "admin1" } as never);
  vi.mocked(enforceRateLimit).mockResolvedValue(undefined as never);
  vi.mocked(saveUpload).mockResolvedValue({ url: "https://cdn.example.com/up/logo.png", key: "up/logo.png", filename: "logo.png", mimeType: "image/png", sizeBytes: 12 } as never);
});

describe("uploadBrandingImageAction", () => {
  it("stores a valid image and returns its address, recording the upload", async () => {
    const res = await uploadBrandingImageAction("logo", form(PNG));
    expect(res).toEqual({ ok: true, url: "https://cdn.example.com/up/logo.png" });
    expect(saveUpload).toHaveBeenCalledOnce();
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ actorId: "admin1", action: "admin.branding_image_uploaded" }));
  });

  it("judges the file by its bytes: an SVG named .png is refused and nothing is stored", async () => {
    const svg = Array.from(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'));
    const res = await uploadBrandingImageAction("share", form(svg, "cover.png", "image/png"));
    expect(res.ok).toBe(false);
    expect(saveUpload).not.toHaveBeenCalled();
  });

  it("refuses an unknown image type and a missing file", async () => {
    expect((await uploadBrandingImageAction("avatar", form(PNG))).ok).toBe(false);
    expect((await uploadBrandingImageAction("logo", new FormData())).ok).toBe(false);
    expect(saveUpload).not.toHaveBeenCalled();
  });

  it("is admin only: a non-admin is stopped before anything is read or stored", async () => {
    vi.mocked(requirePlatformAdmin).mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;/login" }));
    await expect(uploadBrandingImageAction("logo", form(PNG))).rejects.toThrow("NEXT_REDIRECT");
    expect(saveUpload).not.toHaveBeenCalled();
  });

  it("is rate limited", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValue(new RateLimitError(Date.now() + 60_000));
    const res = await uploadBrandingImageAction("logo", form(PNG));
    expect(res).toEqual({ ok: false, error: "Too many requests — please slow down and try again shortly." });
    expect(saveUpload).not.toHaveBeenCalled();
  });

  it("explains it plainly when storage isn't configured, and never throws on a storage failure", async () => {
    vi.mocked(saveUpload).mockRejectedValueOnce(new Error("File storage is not configured. Set S3_BUCKET…"));
    const notSet = await uploadBrandingImageAction("logo", form(PNG));
    expect(notSet.ok).toBe(false);
    if (!notSet.ok) expect(notSet.error).toMatch(/storage isn't set up/i);
    vi.mocked(saveUpload).mockRejectedValueOnce(new Error("network down"));
    const failed = await uploadBrandingImageAction("logo", form(PNG));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toMatch(/Try again/);
  });
});
