import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { InstagramSearchError, searchInstagramLocations, searchInstagramMusic } from "./instagram-search";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const reply = (body: unknown, status = 200) => ({ ok: status < 400, status, text: async () => (typeof body === "string" ? body : JSON.stringify(body)) });

describe("searchInstagramMusic", () => {
  it("asks the Audio API for music for this Instagram user and maps what comes back", async () => {
    fetchMock.mockResolvedValue(
      reply({
        audio: [
          { audio_id: "587784541076604", title: "Birthday Wish", display_artist: "Shuba", duration_in_ms: 153760, cover_artwork_thumbnail_uri: "https://cdn/x.jpg", download_url: "https://cdn/a.mp4" },
          { audio_id: "587784541076614", title: "Other", display_artist: "Drake", on_platform_audio_preview_link: "https://www.instagram.com/a" },
        ],
      }),
    );
    const r = await searchInstagramMusic("TOK", "1784", "birthday");
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain("https://graph.facebook.com/v22.0/ig_audio?audio_type=music&user_id=1784&search_query=birthday");
    expect(url).toContain("access_token=TOK");
    expect(r).toEqual([
      { id: "587784541076604", title: "Birthday Wish", artist: "Shuba", cover: "https://cdn/x.jpg", durationMs: 153760, previewUrl: "https://cdn/a.mp4" },
      { id: "587784541076614", title: "Other", artist: "Drake", cover: "", durationMs: 0, previewUrl: "https://www.instagram.com/a" },
    ]);
  });

  it("an empty search asks for trending tracks", async () => {
    fetchMock.mockResolvedValue(reply({ audio: [] }));
    await searchInstagramMusic("T", "1", "  ");
    expect(String(fetchMock.mock.calls[0][0])).not.toContain("search_query");
  });

  it("drops anything unexpected instead of failing: bad ids, no title, non-https links, a non-list answer", async () => {
    fetchMock.mockResolvedValue(
      reply({ audio: [{ audio_id: "abc", title: "x" }, { audio_id: "5" }, { audio_id: "6", title: "ok", download_url: "http://insecure/a.mp3", cover_artwork_thumbnail_uri: "javascript:alert(1)" }, null] }),
    );
    expect(await searchInstagramMusic("T", "1", "")).toEqual([{ id: "6", title: "ok", artist: "", cover: "", durationMs: 0, previewUrl: "" }]);
    fetchMock.mockResolvedValue(reply({ audio: "nope" }));
    expect(await searchInstagramMusic("T", "1", "")).toEqual([]);
  });

  it("limits the list", async () => {
    fetchMock.mockResolvedValue(reply({ audio: Array.from({ length: 60 }, (_, i) => ({ audio_id: String(i + 1), title: `t${i}` })) }));
    expect((await searchInstagramMusic("T", "1", "")).length).toBe(25);
  });

  it("tells a missing permission from an outage", async () => {
    fetchMock.mockResolvedValue(reply({ error: { message: "(#10) Application does not have permission", code: 10 } }, 400));
    await expect(searchInstagramMusic("T", "1", "")).rejects.toMatchObject({ kind: "permission" });
    fetchMock.mockResolvedValue(reply("boom", 503));
    await expect(searchInstagramMusic("T", "1", "")).rejects.toMatchObject({ kind: "unavailable" });
    fetchMock.mockRejectedValue(new Error("network"));
    await expect(searchInstagramMusic("T", "1", "")).rejects.toBeInstanceOf(InstagramSearchError);
  });
});

describe("searchInstagramLocations", () => {
  it("returns only Pages that have a location, with a readable place", async () => {
    fetchMock.mockResolvedValue(
      reply({
        data: [
          { id: "11", name: "Blue Cafe", location: { city: "Pune", country: "India" } },
          { id: "12", name: "Online Shop" },
          { id: "x", name: "Bad id", location: { city: "A" } },
        ],
      }),
    );
    expect(await searchInstagramLocations("T", "cafe")).toEqual([{ id: "11", name: "Blue Cafe", place: "Pune, India" }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/pages/search?q=cafe&fields=id,name,location");
  });

  it("does not call Meta for a one-letter search", async () => {
    expect(await searchInstagramLocations("T", "a")).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
