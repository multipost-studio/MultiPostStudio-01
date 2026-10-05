import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { db } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { encodeTouch, parseTouch } from "@/lib/attribution";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(), clientIp: vi.fn(async () => "203.0.113.9") }));
vi.mock("@/lib/db", () => ({ db: { acquisitionVisit: { create: vi.fn() } } }));

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

function post(body: unknown, headers: Record<string, string> = {}, cookies = "") {
  return new NextRequest("http://localhost:3000/api/track/visit", {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA, host: "localhost:3000", "x-vercel-ip-country": "US", ...(cookies ? { cookie: cookies } : {}), ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const setCookie = (res: Response) => res.headers.getSetCookie();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 100, resetAt: Date.now() + 60_000 });
  vi.mocked(db.acquisitionVisit.create).mockResolvedValue({} as never);
});

describe("POST /api/track/visit", () => {
  it("records a tagged visit with normalised fields and sets visitor + touch cookies", async () => {
    const res = await POST(post({ landing: "/pricing?utm_source=Google&utm_medium=CPC&utm_campaign=Spring%20Launch", referrer: "https://www.google.com/" }));
    expect(res.status).toBe(204);
    const data = vi.mocked(db.acquisitionVisit.create).mock.calls[0]![0]!.data;
    expect(data).toMatchObject({ channel: "Paid Search", source: "google", medium: "cpc", campaign: "spring_launch", landingPath: "/pricing" });
    expect(data.visitorId).toMatch(/^[a-f0-9]{32}$/);
    const names = setCookie(res).map((c) => c.split("=")[0]);
    expect(names).toEqual(expect.arrayContaining(["mps_vid", "mps_ft", "mps_lt"]));
    expect(setCookie(res).every((c) => /HttpOnly/i.test(c) && /SameSite=lax/i.test(c))).toBe(true);
  });

  it("stores no IP address or user agent", async () => {
    await POST(post({ landing: "/" }));
    const data = vi.mocked(db.acquisitionVisit.create).mock.calls[0]![0]!.data as Record<string, unknown>;
    expect(Object.keys(data).sort()).toEqual(["campaign", "channel", "clickId", "content", "landingPath", "medium", "referrerHost", "source", "term", "visitorId"]);
  });

  it("records nothing and sets nothing when Do Not Track or Global Privacy Control is on", async () => {
    for (const h of [{ dnt: "1" }, { "sec-gpc": "1" }] as Record<string, string>[]) {
      const res = await POST(post({ landing: "/?utm_source=x" }, h));
      expect(res.status).toBe(204);
      expect(setCookie(res)).toEqual([]);
    }
    expect(db.acquisitionVisit.create).not.toHaveBeenCalled();
  });

  it("records nothing in opt-in regions (or when location is unknown) until the visitor consents", async () => {
    const eu = await POST(post({ landing: "/?utm_source=x" }, { "x-vercel-ip-country": "DE" }));
    expect(eu.status).toBe(204);
    expect(setCookie(eu)).toEqual([]);
    const unknown = await POST(post({ landing: "/" }, { "x-vercel-ip-country": "" }));
    expect(setCookie(unknown)).toEqual([]);
    expect(db.acquisitionVisit.create).not.toHaveBeenCalled();
  });

  it("records in an opt-in region once the visitor has accepted", async () => {
    const res = await POST(post({ landing: "/" }, { "x-vercel-ip-country": "DE" }, "mps_consent=all"));
    expect(db.acquisitionVisit.create).toHaveBeenCalledTimes(1);
    expect(setCookie(res).map((c) => c.split("=")[0])).toEqual(expect.arrayContaining(["mps_vid", "mps_ft", "mps_lt"]));
  });

  it("stops recording anywhere once the visitor has declined", async () => {
    const res = await POST(post({ landing: "/?utm_source=x" }, {}, "mps_consent=essential"));
    expect(res.status).toBe(204);
    expect(setCookie(res)).toEqual([]);
    expect(db.acquisitionVisit.create).not.toHaveBeenCalled();
  });

  it("ignores bots", async () => {
    const res = await POST(post({ landing: "/" }, { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }));
    expect(res.status).toBe(204);
    expect(db.acquisitionVisit.create).not.toHaveBeenCalled();
  });

  it("rejects cross-site posts, malformed bodies and rate-limited callers", async () => {
    expect((await POST(post({ landing: "/" }, { origin: "https://evil.example" }))).status).toBe(403);
    expect((await POST(post("not json"))).status).toBe(400);
    expect((await POST(post({ landing: "x".repeat(700) }))).status).toBe(400);
    vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    expect((await POST(post({ landing: "/" }))).status).toBe(429);
    expect(db.acquisitionVisit.create).not.toHaveBeenCalled();
  });

  it("keeps the first touch and last marketing touch across visits, and reuses the visitor id", async () => {
    const google = parseTouch({ landing: "/?utm_source=google&utm_medium=cpc&utm_campaign=a", selfHosts: ["localhost"] });
    const vid = "a".repeat(32);
    const res = await POST(post({ landing: "/blog" }, {}, `mps_vid=${vid}; mps_ft=${encodeURIComponent(encodeTouch(google))}; mps_lt=${encodeURIComponent(encodeTouch(google))}`));
    expect(vi.mocked(db.acquisitionVisit.create).mock.calls[0]![0]!.data.visitorId).toBe(vid);
    const ft = setCookie(res).find((c) => c.startsWith("mps_ft="))!;
    const lt = setCookie(res).find((c) => c.startsWith("mps_lt="))!;
    expect(decodeURIComponent(ft)).toContain('"source":"google"'); // direct return visit does not overwrite
    expect(decodeURIComponent(lt)).toContain('"source":"google"');
  });

  it("still succeeds when the database write fails (visitors never see tracking errors)", async () => {
    vi.mocked(db.acquisitionVisit.create).mockRejectedValue(new Error("relation does not exist"));
    expect((await POST(post({ landing: "/" }))).status).toBe(204);
  });

  it("ignores a tampered touch cookie instead of trusting it", async () => {
    const res = await POST(post({ landing: "/" }, {}, `mps_ft=${encodeURIComponent('{"channel":"Hacked"}')}`));
    expect(res.status).toBe(204);
    const ft = decodeURIComponent(setCookie(res).find((c) => c.startsWith("mps_ft="))!);
    expect(ft).toContain('"channel":"Direct"');
  });
});
