import { describe, it, expect } from "vitest";
import { isUnsplashUrl } from "./unsplash";

// Regression test for the SSRF found in the security audit: importUnsplashAction
// used to fetch(d.regular) with a client-supplied url straight from the
// request, with only z.string().url() validation — meaning an attacker could
// point the server at an internal/private/cloud-metadata address and have the
// response stored (and re-servable) as a "photo". isUnsplashUrl() is the fix;
// this locks it in.
describe("isUnsplashUrl (SSRF guard)", () => {
  it("allows Unsplash's own image and API hosts over https", () => {
    expect(isUnsplashUrl("https://images.unsplash.com/photo-123")).toBe(true);
    expect(isUnsplashUrl("https://api.unsplash.com/photos/123/download")).toBe(true);
    expect(isUnsplashUrl("https://plus.unsplash.com/premium_photo-1")).toBe(true);
  });

  it("rejects any other host, including internal/private/cloud-metadata targets", () => {
    expect(isUnsplashUrl("http://169.254.169.254/latest/meta-data/")).toBe(false);
    expect(isUnsplashUrl("http://localhost:3000/api/internal")).toBe(false);
    expect(isUnsplashUrl("http://127.0.0.1:6379")).toBe(false);
    expect(isUnsplashUrl("http://10.0.0.5/admin")).toBe(false);
    expect(isUnsplashUrl("https://evil.example.com/images.unsplash.com")).toBe(false);
    expect(isUnsplashUrl("https://images.unsplash.com.evil.com/x")).toBe(false);
  });

  it("rejects non-https and malformed urls", () => {
    expect(isUnsplashUrl("http://images.unsplash.com/photo")).toBe(false); // must be https
    expect(isUnsplashUrl("not a url")).toBe(false);
    expect(isUnsplashUrl("")).toBe(false);
    expect(isUnsplashUrl("file:///etc/passwd")).toBe(false);
  });
});
