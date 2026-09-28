import { describe, it, expect, vi, afterEach } from "vitest";
import { revokeAtProvider } from "./oauth";

/**
 * revokeAtProvider is what actually kills a grant at the provider when a
 * channel is disconnected — without it, reconnecting could silently reuse
 * the old grant instead of asking for fresh consent. Covering: it must
 * never throw (a dead network call must not block disconnect), it must
 * skip stub/demo tokens, and it must call the right endpoint per platform.
 */
describe("revokeAtProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing for a null token", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await revokeAtProvider("youtube", null);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does nothing for a stub/demo token", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await revokeAtProvider("youtube", "stub_abc123");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("calls Google's revoke endpoint for youtube", async () => {
    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await revokeAtProvider("youtube", "real_token");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toBe("https://oauth2.googleapis.com/revoke");
  });

  it("does nothing for a platform with no known revoke endpoint", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    await revokeAtProvider("linkedin", "real_token");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("never throws when the provider is unreachable", async () => {
    vi.spyOn(global, "fetch").mockRejectedValue(new Error("network down"));
    await expect(revokeAtProvider("youtube", "real_token")).resolves.toBeUndefined();
  });
});
