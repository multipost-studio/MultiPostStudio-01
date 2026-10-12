import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ env: { PINTEREST_SANDBOX: undefined as string | undefined } }));
vi.mock("@/lib/env", () => ({ env: st.env }));

import {
  CAROUSEL_MAX, PIN_DESCRIPTION_MAX, PIN_TITLE_MAX, PinterestApiError, analyticsWindow, buildPinPayload, checkBoardName, createBoard, explainPinterestError,
  getMediaStatus, getPinAnalytics, listBoards, parseAccount, parseBoard, parseMediaRegistration, parseMediaStatus, parsePinAnalytics, parsePinOptions,
  pinterestApiBase, registerVideoUpload, safePinLink, splitTitleDescription, uploadVideoBytes,
} from "./pinterest";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  st.env.PINTEREST_SANDBOX = undefined;
  vi.stubGlobal("fetch", fetchMock);
});

describe("api base", () => {
  it("is the live API, or the sandbox when PINTEREST_SANDBOX=true", () => {
    expect(pinterestApiBase()).toBe("https://api.pinterest.com/v5");
    st.env.PINTEREST_SANDBOX = "true";
    expect(pinterestApiBase()).toBe("https://api-sandbox.pinterest.com/v5");
  });
});

describe("safePinLink and parsePinOptions", () => {
  it("allows https links only", () => {
    expect(safePinLink("https://shop.example.com/p?id=1")).toBe("https://shop.example.com/p?id=1");
    for (const bad of ["http://example.com", "javascript:alert(1)", "data:text/html,x", "https://localhost", "example.com", "", null, 5, "https://" + "a".repeat(2100) + ".com"]) expect(safePinLink(bad), String(bad)).toBeNull();
  });
  it("keeps only valid options and ignores damaged metadata", () => {
    expect(parsePinOptions(JSON.stringify({ boardId: " 12345 ", link: "https://x.example.com", title: "  Hello  ", other: 1 }))).toEqual({ boardId: "12345", link: "https://x.example.com/", title: "Hello" });
    expect(parsePinOptions(JSON.stringify({ boardId: "abc; DROP", link: "http://x.com", title: "   " }))).toEqual({});
    expect(parsePinOptions("not json")).toEqual({});
    expect(parsePinOptions(null)).toEqual({});
    expect(parsePinOptions(JSON.stringify({ title: "x".repeat(300) })).title).toHaveLength(PIN_TITLE_MAX);
  });
});

describe("splitTitleDescription", () => {
  it("uses the first line as the title and the whole text as the description", () => {
    expect(splitTitleDescription("Autumn table\nCosy ideas #fall")).toEqual({ title: "Autumn table", description: "Autumn table\nCosy ideas #fall" });
  });
  it("prefers an explicit title, caps lengths, and never returns an empty title", () => {
    expect(splitTitleDescription("body", "My title").title).toBe("My title");
    expect(splitTitleDescription("x".repeat(500)).title).toHaveLength(PIN_TITLE_MAX);
    expect(splitTitleDescription("x".repeat(2000)).description).toHaveLength(PIN_DESCRIPTION_MAX);
    expect(splitTitleDescription("   ").title).toBe("New Pin");
  });
});

describe("buildPinPayload", () => {
  const img = (n: number, alt?: string) => ({ url: `https://cdn.example.com/${n}.jpg`, altText: alt });

  it("single image pin with title, link and alt text", () => {
    expect(buildPinPayload({ boardId: "b1", body: "Title\nMore", options: { link: "https://shop.example.com/" }, images: [img(1, "A red chair")] })).toEqual({
      board_id: "b1", title: "Title", description: "Title\nMore", link: "https://shop.example.com/", alt_text: "A red chair",
      media_source: { source_type: "image_url", url: "https://cdn.example.com/1.jpg" },
    });
  });

  it("omits link and alt text when there are none", () => {
    const p = buildPinPayload({ boardId: "b1", body: "T", options: {}, images: [img(1)] });
    expect(p).not.toHaveProperty("link");
    expect(p).not.toHaveProperty("alt_text");
  });

  it("carousel: two to five images, each carrying the link and its description", () => {
    const p = buildPinPayload({ boardId: "b1", body: "T", options: { link: "https://x.example.com/" }, images: [img(1, "one"), img(2), img(3)] }) as { media_source: { source_type: string; items: Record<string, string>[] } };
    expect(p.media_source.source_type).toBe("multiple_image_urls");
    expect(p.media_source.items).toEqual([
      { url: "https://cdn.example.com/1.jpg", link: "https://x.example.com/", description: "one" },
      { url: "https://cdn.example.com/2.jpg", link: "https://x.example.com/" },
      { url: "https://cdn.example.com/3.jpg", link: "https://x.example.com/" },
    ]);
  });

  it("refuses no images and too many images", () => {
    expect(() => buildPinPayload({ boardId: "b1", body: "T", options: {}, images: [] })).toThrow(/image attachment/);
    expect(() => buildPinPayload({ boardId: "b1", body: "T", options: {}, images: Array.from({ length: CAROUSEL_MAX + 1 }, (_, i) => img(i)) })).toThrow(/2 to 5/);
  });

  it("video pin: media id with a cover image, or a key frame when there is no cover", () => {
    expect(buildPinPayload({ boardId: "b1", body: "T", options: {}, videoMediaId: "m1", coverUrl: "https://cdn.example.com/c.jpg" })).toMatchObject({ media_source: { source_type: "video_id", media_id: "m1", cover_image_url: "https://cdn.example.com/c.jpg" } });
    const p = buildPinPayload({ boardId: "b1", body: "T", options: {}, videoMediaId: "m1" }) as { media_source: Record<string, unknown> };
    expect(p.media_source).toEqual({ source_type: "video_id", media_id: "m1", cover_image_key_frame_time: 0 });
  });
});

describe("boards", () => {
  it("parseBoard keeps valid boards and defaults privacy to public", () => {
    expect(parseBoard({ id: "1", name: "Recipes", privacy: "SECRET", pin_count: 4, description: "d" })).toEqual({ id: "1", name: "Recipes", description: "d", privacy: "SECRET", pinCount: 4 });
    expect(parseBoard({ id: "2", name: "N" })).toMatchObject({ privacy: "PUBLIC", pinCount: 0 });
    for (const bad of [null, "x", {}, { id: "1" }, { name: "n" }, { id: "", name: "n" }]) expect(parseBoard(bad)).toBeNull();
  });

  it("listBoards follows bookmarks, skips malformed items, and stops at the cap", async () => {
    fetchMock
      .mockResolvedValueOnce(json({ items: [{ id: "1", name: "A" }, { bad: true }], bookmark: "next1" }))
      .mockResolvedValueOnce(json({ items: [{ id: "2", name: "B" }], bookmark: null }));
    const boards = await listBoards("tok");
    expect(boards.map((b) => b.id)).toEqual(["1", "2"]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.pinterest.com/v5/boards?page_size=100");
    expect(fetchMock.mock.calls[1][0]).toBe("https://api.pinterest.com/v5/boards?page_size=100&bookmark=next1");
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: "Bearer tok" });
  });

  it("createBoard posts the name and privacy, and returns the board", async () => {
    fetchMock.mockResolvedValueOnce(json({ id: "9", name: "New", privacy: "PUBLIC" }));
    expect(await createBoard("tok", { name: "New" })).toMatchObject({ id: "9", name: "New" });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ name: "New", privacy: "PUBLIC" });
    fetchMock.mockResolvedValueOnce(json({ surprise: 1 }));
    await expect(createBoard("tok", { name: "X" })).rejects.toThrow(/didn't return the new board/);
  });

  it("checkBoardName trims, collapses whitespace and bounds the length", () => {
    expect(checkBoardName("  My   board ")).toEqual({ ok: true, name: "My board" });
    expect(checkBoardName("").ok).toBe(false);
    expect(checkBoardName("x".repeat(51)).ok).toBe(false);
    expect(checkBoardName(5).ok).toBe(false);
  });
});

describe("api errors", () => {
  it("carry the status, Pinterest's code and message", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 29, message: "Trial access: not allowed" }, 403));
    const err = await listBoards("tok").catch((e) => e);
    expect(err).toBeInstanceOf(PinterestApiError);
    expect(err).toMatchObject({ status: 403, code: 29 });
    expect(err.message).toMatch(/^Pinterest boards 403 \(code 29\): Trial access/);
  });
  it("keep non-JSON error text", async () => {
    fetchMock.mockResolvedValueOnce(new Response("gateway down", { status: 502 }));
    await expect(listBoards("tok")).rejects.toMatchObject({ status: 502, detail: "gateway down" });
  });
});

describe("explainPinterestError", () => {
  it("keeps the status line first so retry and token-expiry detection still work, and adds what to do", () => {
    const trial = explainPinterestError(new PinterestApiError(403, 29, "Your application consumer type is not allowed", "pin"));
    expect(trial.startsWith("Pinterest pin 403")).toBe(true);
    expect(trial).toMatch(/Standard access/);
    expect(explainPinterestError(new PinterestApiError(404, 40, "Board not found", "pin"))).toMatch(/Choose another board/);
    expect(explainPinterestError(new PinterestApiError(400, 1, "Invalid image url", "pin"))).toMatch(/public JPEG, PNG or WebP/);
    expect(explainPinterestError(new PinterestApiError(429, null, "Rate limited", "pin"))).toBe("Pinterest pin 429: Rate limited");
    expect(explainPinterestError(new Error("boom"))).toBe("boom");
  });
});

describe("video upload", () => {
  const reg = { media_id: "123", media_type: "video", upload_url: "https://pinterest-media-upload.s3.amazonaws.com/", upload_parameters: { key: "k", policy: "p", n: 5 } };

  it("parses the registration, keeping only string parameters and refusing non-https targets", () => {
    expect(parseMediaRegistration(reg)).toEqual({ mediaId: "123", uploadUrl: "https://pinterest-media-upload.s3.amazonaws.com/", fields: { key: "k", policy: "p" } });
    expect(parseMediaRegistration({ ...reg, media_id: 456 })?.mediaId).toBe("456");
    expect(parseMediaRegistration({ ...reg, upload_url: "http://evil.example.com/" })).toBeNull();
    expect(parseMediaRegistration({ ...reg, upload_url: "not a url" })).toBeNull();
    for (const bad of [null, {}, { media_id: "1" }, { ...reg, upload_parameters: null }]) expect(parseMediaRegistration(bad)).toBeNull();
  });

  it("registers a video upload", async () => {
    fetchMock.mockResolvedValueOnce(json(reg, 201));
    expect((await registerVideoUpload("tok")).mediaId).toBe("123");
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.pinterest.com/v5/media");
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ media_type: "video" });
    fetchMock.mockResolvedValueOnce(json({ nope: 1 }));
    await expect(registerVideoUpload("tok")).rejects.toThrow(/usable upload target/);
  });

  it("uploads the form fields first and the file last, without the Pinterest token", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    await uploadVideoBytes({ mediaId: "1", uploadUrl: "https://s3.example.com/", fields: { key: "k", policy: "p" } }, new Uint8Array([1, 2, 3]), "video/mp4");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://s3.example.com/");
    expect(init.headers).toBeUndefined();
    expect([...(init.body as FormData).keys()]).toEqual(["key", "policy", "file"]);
    fetchMock.mockResolvedValueOnce(new Response("denied", { status: 403 }));
    await expect(uploadVideoBytes({ mediaId: "1", uploadUrl: "https://s3.example.com/", fields: {} }, new Uint8Array([1]), "video/mp4")).rejects.toThrow(/upload 403/);
  });

  it("reads the processing status", async () => {
    expect(parseMediaStatus({ status: "succeeded" })).toBe("succeeded");
    expect(parseMediaStatus({ status: "weird" })).toBe("unknown");
    expect(parseMediaStatus(null)).toBe("unknown");
    fetchMock.mockResolvedValueOnce(json({ media_id: "1", status: "processing" }));
    expect(await getMediaStatus("tok", "1")).toBe("processing");
  });
});

describe("analytics", () => {
  it("prefers lifetime metrics, then the summary, then the daily rows", () => {
    expect(parsePinAnalytics({ all: { lifetime_metrics: { IMPRESSION: 100, SAVE: 5, PIN_CLICK: 7, OUTBOUND_CLICK: 3 } } })).toEqual({ impressions: 100, saves: 5, pinClicks: 7, outboundClicks: 3, videoViews: 0 });
    expect(parsePinAnalytics({ all: { lifetime_metrics: {}, summary_metrics: { IMPRESSION: 50, VIDEO_MRC_VIEW: 9 } } })).toMatchObject({ impressions: 50, videoViews: 9 });
    expect(parsePinAnalytics({ all: { daily_metrics: [{ metrics: { IMPRESSION: 10, SAVE: 1 } }, { metrics: { IMPRESSION: 20 } }, null, { metrics: null }] } })).toMatchObject({ impressions: 30, saves: 1 });
  });
  it("ignores negative, non-numeric and missing values, and rejects the wrong shape", () => {
    expect(parsePinAnalytics({ all: { lifetime_metrics: { IMPRESSION: -5, SAVE: "x", PIN_CLICK: 2 } } })).toMatchObject({ impressions: 0, saves: 0, pinClicks: 2 });
    expect(parsePinAnalytics({ all: {} })).toEqual({ impressions: 0, saves: 0, pinClicks: 0, outboundClicks: 0, videoViews: 0 });
    for (const bad of [null, "x", {}, { all: null }]) expect(parsePinAnalytics(bad)).toBeNull();
  });
  it("clamps the window to the last 90 days", () => {
    const now = new Date("2026-10-12T00:00:00Z");
    expect(analyticsWindow(new Date("2026-10-01T00:00:00Z"), now)).toEqual({ start: "2026-10-01", end: "2026-10-12" });
    expect(analyticsWindow(new Date("2025-01-01T00:00:00Z"), now)).toEqual({ start: "2026-07-15", end: "2026-10-12" });
  });
  it("asks for video views only for video pins, and falls back to the core metrics on a 400", async () => {
    fetchMock.mockResolvedValueOnce(json({ code: 1, message: "bad metric" }, 400)).mockResolvedValueOnce(json({ all: { lifetime_metrics: { IMPRESSION: 8 } } }));
    const m = await getPinAnalytics("tok", "p1", new Date(), true);
    expect(m?.impressions).toBe(8);
    expect(fetchMock.mock.calls[0][0]).toContain("VIDEO_MRC_VIEW");
    expect(fetchMock.mock.calls[1][0]).toContain("metric_types=IMPRESSION,SAVE,PIN_CLICK&");
    fetchMock.mockResolvedValueOnce(json({ all: {} }));
    await getPinAnalytics("tok", "p1", new Date(), false);
    expect(fetchMock.mock.calls[2][0]).not.toContain("VIDEO_MRC_VIEW");
  });
  it("lets other failures through", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "no" }, 401));
    await expect(getPinAnalytics("tok", "p1", new Date(), false)).rejects.toMatchObject({ status: 401 });
  });
  it("parses the account", () => {
    expect(parseAccount({ follower_count: 120, account_type: "BUSINESS", username: "acme" })).toEqual({ followerCount: 120, accountType: "BUSINESS", username: "acme" });
    expect(parseAccount(null)).toEqual({ followerCount: null, accountType: null, username: null });
  });
});
