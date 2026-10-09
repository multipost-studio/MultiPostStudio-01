import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ authorized: true, rl: vi.fn(), tick: vi.fn() }));

vi.mock("@/lib/cron-auth", () => ({ authorizedCronRequest: () => m.authorized }));
vi.mock("@/lib/scheduled-work", () => ({ runScheduledWork: () => m.tick() }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => m.rl(...a),
  rateLimitHeaders: () => ({}),
  retryAfterSec: () => 30,
}));

import { GET, POST, maxDuration } from "./route";

const req = () => new NextRequest("http://localhost/api/cron/tick");

beforeEach(() => {
  vi.clearAllMocks();
  m.authorized = true;
  m.rl.mockResolvedValue({ ok: true, remaining: 10, resetAt: Date.now() + 1000 });
  m.tick.mockResolvedValue({ processed: 2 });
});

describe("/api/cron/tick", () => {
  it("rejects callers without the cron secret", async () => {
    m.authorized = false;
    expect((await GET(req())).status).toBe(401);
    expect(m.tick).not.toHaveBeenCalled();
  });

  it("runs a tick for an authorised caller, on GET and POST", async () => {
    expect(await (await GET(req())).json()).toMatchObject({ ok: true, processed: 2 });
    expect((await POST(req())).status).toBe(200);
  });

  it("the flood guard sits well above what a legitimate runner can produce", async () => {
    await GET(req());
    const [key, limit, windowMs] = m.rl.mock.calls[0];
    expect(key).toBe("cron:tick");
    expect(windowMs).toBe(3_600_000);
    // once a minute is 60/h, the 20s browser poller 180/h, both together 240/h
    expect(limit).toBeGreaterThanOrEqual(600);
  });

  it("still refuses a genuine flood", async () => {
    m.rl.mockResolvedValue({ ok: false, remaining: 0, resetAt: Date.now() + 1000 });
    const res = await GET(req());
    expect(res.status).toBe(429);
    expect(m.tick).not.toHaveBeenCalled();
  });

  it("hides the reason a tick failed", async () => {
    m.tick.mockRejectedValue(new Error("password=hunter2"));
    const res = await GET(req());
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("hunter2");
  });

  it("asks the platform for enough time to finish a tick", () => {
    expect(maxDuration).toBeGreaterThanOrEqual(60);
  });
});
