import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const m = vi.hoisted(() => ({ secret: "app-secret-value" as string | null }));

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({
  get env() {
    return { OAUTH_THREADS_CLIENT_SECRET: m.secret ?? undefined, OAUTH_META_CLIENT_SECRET: undefined };
  },
  appUrl: (p = "") => `https://app.test${p}`,
  isProduction: true,
}));
vi.mock("@/lib/events", () => ({ logAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/adapters/billing", () => ({ debumpUsage: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: vi.fn().mockResolvedValue({ ok: true, remaining: 1, resetAt: 0 }) }));
vi.mock("@/lib/db", () => ({
  db: { socialAccount: { findMany: vi.fn(), delete: vi.fn(), update: vi.fn() } },
}));

import { db } from "@/lib/db";
import { debumpUsage } from "@/lib/adapters/billing";
import { POST as del } from "./delete/route";
import { POST as deauth } from "./deauthorize/route";
import { parseSignedRequest } from "@/lib/social/meta-signed-request";

const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const sign = (payload: unknown, secret = "app-secret-value") => {
  const p = b64(payload);
  return `${createHmac("sha256", secret).update(p).digest("base64url")}.${p}`;
};
const post = (path: string, signed?: string) => {
  const form = new FormData();
  if (signed !== undefined) form.set("signed_request", signed);
  return new NextRequest(`http://localhost${path}`, { method: "POST", body: form });
};

beforeEach(() => {
  vi.clearAllMocks();
  m.secret = "app-secret-value";
  vi.mocked(db.socialAccount.findMany).mockResolvedValue([{ id: "a1", workspaceId: "w1", handle: "@x", workspace: { orgId: "o1" }, _count: { channels: 2 } }] as never);
  vi.mocked(db.socialAccount.delete).mockResolvedValue({} as never);
  vi.mocked(db.socialAccount.update).mockResolvedValue({} as never);
});

describe("parseSignedRequest", () => {
  it("accepts a correctly signed payload and reads the user id", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA256", user_id: "123" }), "app-secret-value")).toEqual({ user_id: "123" });
  });
  it("rejects a wrong secret, a tampered payload, and junk", () => {
    expect(parseSignedRequest(sign({ user_id: "123" }, "other"), "app-secret-value")).toBeNull();
    const [sig] = sign({ user_id: "123" }).split(".");
    expect(parseSignedRequest(`${sig}.${b64({ user_id: "999" })}`, "app-secret-value")).toBeNull();
    for (const bad of ["", "nodot", "a.b.c", ".", "x".repeat(5000)]) expect(parseSignedRequest(bad, "app-secret-value")).toBeNull();
  });
  it("rejects an unsupported algorithm and drops a non-numeric user id", () => {
    expect(parseSignedRequest(sign({ algorithm: "HMAC-SHA1", user_id: "1" }), "app-secret-value")).toBeNull();
    expect(parseSignedRequest(sign({ user_id: '1"}],"x":"' }), "app-secret-value")).toEqual({ user_id: undefined });
  });
});

describe("POST /api/threads/delete", () => {
  it("deletes the connected Threads account for a verified request and returns Meta's confirmation shape", async () => {
    const res = await del(post("/api/threads/delete", sign({ algorithm: "HMAC-SHA256", user_id: "123" })));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.confirmation_code).toMatch(/^[0-9a-f-]{36}$/);
    expect(body.url).toContain(`/legal/data-deletion?code=${body.confirmation_code}`);
    expect(db.socialAccount.delete).toHaveBeenCalledWith({ where: { id: "a1" } });
    expect(debumpUsage).toHaveBeenCalledWith("o1", "channels", 2);
    expect(vi.mocked(db.socialAccount.findMany).mock.calls[0][0]!.where).toMatchObject({ platform: "threads", metadata: { contains: '"remoteId":"123"' } });
  });

  it("an unsigned, wrongly signed or missing request deletes nothing and is refused", async () => {
    for (const s of [undefined, "garbage", sign({ user_id: "123" }, "attacker-secret")]) {
      const res = await del(post("/api/threads/delete", s));
      expect(res.status).toBe(400);
    }
    expect(db.socialAccount.delete).not.toHaveBeenCalled();
    expect(db.socialAccount.findMany).not.toHaveBeenCalled();
  });

  it("without a configured secret it refuses everything", async () => {
    m.secret = null;
    expect((await del(post("/api/threads/delete", sign({ user_id: "123" })))).status).toBe(503);
    expect(db.socialAccount.delete).not.toHaveBeenCalled();
  });

  it("a verified request for someone we have nothing for still gets a confirmation", async () => {
    vi.mocked(db.socialAccount.findMany).mockResolvedValue([] as never);
    const res = await del(post("/api/threads/delete", sign({ user_id: "555" })));
    expect(res.status).toBe(200);
    expect(db.socialAccount.delete).not.toHaveBeenCalled();
  });

  it("does not claim success if the deletion itself failed", async () => {
    vi.mocked(db.socialAccount.delete).mockRejectedValue(new Error("db down"));
    expect((await del(post("/api/threads/delete", sign({ user_id: "123" })))).status).toBe(500);
  });
});

describe("POST /api/threads/deauthorize", () => {
  it("erases the tokens and marks the account disconnected on a verified request", async () => {
    const res = await deauth(post("/api/threads/deauthorize", sign({ user_id: "123" })));
    expect(res.status).toBe(200);
    expect(db.socialAccount.update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { accessToken: null, refreshToken: null, status: "disconnected" } });
  });

  it("changes nothing for an unsigned request, and acknowledges a bare ping", async () => {
    expect((await deauth(post("/api/threads/deauthorize", sign({ user_id: "123" }, "attacker")))).status).toBe(400);
    expect((await deauth(post("/api/threads/deauthorize"))).status).toBe(200);
    expect(db.socialAccount.update).not.toHaveBeenCalled();
  });
});
