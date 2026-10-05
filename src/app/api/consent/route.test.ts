import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./route";
import { rateLimit } from "@/lib/rate-limit";

vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn(), clientIp: vi.fn(async () => "203.0.113.9") }));

const url = "http://localhost:3000/api/consent";
const get = (headers: Record<string, string> = {}, cookie = "") => new NextRequest(url, { headers: { host: "localhost:3000", ...(cookie ? { cookie } : {}), ...headers } });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: "POST", headers: { "content-type": "application/json", host: "localhost:3000", "x-vercel-ip-country": "DE", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(rateLimit).mockResolvedValue({ ok: true, remaining: 10, resetAt: Date.now() + 1000 });
});

describe("GET /api/consent", () => {
  it("asks EU visitors and keeps analytics off until they choose", async () => {
    const s = await (await GET(get({ "x-vercel-ip-country": "FR" }))).json();
    expect(s).toMatchObject({ show: true, analytics: false, optIn: true, choice: null });
  });

  it("shows a notice but allows analytics outside opt-in regions", async () => {
    const s = await (await GET(get({ "x-vercel-ip-country": "US" }))).json();
    expect(s).toMatchObject({ show: true, analytics: true, optIn: false });
  });

  it("reflects a stored choice and never caches", async () => {
    const res = await GET(get({ "x-vercel-ip-country": "FR" }, "mps_consent=all"));
    expect(await res.json()).toMatchObject({ show: false, analytics: true, choice: "all" });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("honours a browser privacy signal over everything", async () => {
    const s = await (await GET(get({ "x-vercel-ip-country": "US", "sec-gpc": "1" }, "mps_consent=all"))).json();
    expect(s).toMatchObject({ analytics: false, show: false, signal: true });
  });

  it("treats a tampered cookie as no choice", async () => {
    const s = await (await GET(get({ "x-vercel-ip-country": "FR" }, "mps_consent=yes%3B%20admin"))).json();
    expect(s.choice).toBeNull();
  });
});

describe("POST /api/consent", () => {
  it("stores 'all' and enables analytics", async () => {
    const res = await POST(post({ choice: "all" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ analytics: true, choice: "all", show: false });
    const c = res.headers.getSetCookie().find((x) => x.startsWith("mps_consent="))!;
    expect(c).toContain("mps_consent=all");
    expect(c).toMatch(/Max-Age=31536000/);
    expect(c).toMatch(/HttpOnly/i);
  });

  it("declining stores 'essential' and removes the analytics cookies already set", async () => {
    const res = await POST(post({ choice: "essential" }));
    expect(await res.json()).toMatchObject({ analytics: false, choice: "essential" });
    const cookies = res.headers.getSetCookie();
    for (const name of ["mps_vid", "mps_ft", "mps_lt"]) {
      const c = cookies.find((x) => x.startsWith(`${name}=`));
      expect(c, name).toBeTruthy();
      expect(c).toMatch(/Max-Age=0/);
    }
  });

  it("rejects bad choices, cross-site posts and rate-limited callers", async () => {
    expect((await POST(post({ choice: "everything" }))).status).toBe(400);
    expect((await POST(post("nope"))).status).toBe(400);
    expect((await POST(post({ choice: "all" }, { origin: "https://evil.example" }))).status).toBe(403);
    vi.mocked(rateLimit).mockResolvedValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    expect((await POST(post({ choice: "all" }))).status).toBe(429);
  });
});
