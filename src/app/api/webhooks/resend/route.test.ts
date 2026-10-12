import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const st = vi.hoisted(() => ({ secret: undefined as string | undefined }));

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ env: { get RESEND_WEBHOOK_SECRET() { return st.secret; } } }));
vi.mock("@/lib/db", () => ({ db: { emailLog: { findFirst: vi.fn(), update: vi.fn() } } }));

import { db } from "@/lib/db";
import { POST } from "./route";

const RAW = Buffer.from("signing-key-for-tests-0123456789").toString("base64");
const nowSec = () => String(Math.floor(Date.now() / 1000));
function req(payload: unknown, opts: { sign?: boolean; ts?: string; secretRaw?: string } = {}) {
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  const ts = opts.ts ?? nowSec();
  const headers: Record<string, string> = { "svix-id": "msg_1", "svix-timestamp": ts, "content-type": "application/json" };
  if (opts.sign !== false) headers["svix-signature"] = `v1,${createHmac("sha256", Buffer.from(opts.secretRaw ?? RAW, "base64")).update(`msg_1.${ts}.${body}`).digest("base64")}`;
  return new NextRequest("http://localhost/api/webhooks/resend", { method: "POST", body, headers });
}

beforeEach(() => {
  vi.clearAllMocks();
  st.secret = `whsec_${RAW}`;
  vi.mocked(db.emailLog.findFirst).mockResolvedValue({ id: "l1", status: "sent" } as never);
  vi.mocked(db.emailLog.update).mockResolvedValue({} as never);
});

describe("POST /api/webhooks/resend", () => {
  it("refuses everything when no secret is configured", async () => {
    st.secret = undefined;
    expect((await POST(req({ type: "email.delivered", data: { email_id: "e1" } }))).status).toBe(503);
    expect(db.emailLog.update).not.toHaveBeenCalled();
  });

  it("rejects missing, wrong and replayed signatures", async () => {
    const evt = { type: "email.delivered", data: { email_id: "e1" } };
    expect((await POST(req(evt, { sign: false }))).status).toBe(401);
    expect((await POST(req(evt, { secretRaw: Buffer.from("another-secret").toString("base64") }))).status).toBe(401);
    expect((await POST(req(evt, { ts: String(Math.floor(Date.now() / 1000) - 3600) }))).status).toBe(401);
    expect(db.emailLog.update).not.toHaveBeenCalled();
  });

  it("applies a delivery event to the matching log row", async () => {
    expect((await POST(req({ type: "email.delivered", data: { email_id: "e1" } }))).status).toBe(200);
    expect(db.emailLog.findFirst).toHaveBeenCalledWith({ where: { providerId: "e1" }, select: { id: true, status: true } });
    expect(db.emailLog.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "delivered" } });
  });

  it("opens and clicks set flags without touching the status", async () => {
    await POST(req({ type: "email.opened", data: { email_id: "e1" } }));
    await POST(req({ type: "email.clicked", data: { email_id: "e1" } }));
    expect(vi.mocked(db.emailLog.update).mock.calls.map((c) => c[0].data)).toEqual([{ opened: true }, { clicked: true }]);
  });

  it("a late 'delivered' never hides a bounce", async () => {
    vi.mocked(db.emailLog.findFirst).mockResolvedValue({ id: "l1", status: "bounced" } as never);
    await POST(req({ type: "email.delivered", data: { email_id: "e1" } }));
    expect(db.emailLog.update).toHaveBeenCalledWith({ where: { id: "l1" }, data: { status: "bounced" } });
  });

  it("acknowledges events it does not track, emails it never logged, and events without an id", async () => {
    expect(await (await POST(req({ type: "domain.updated", data: {} }))).json()).toMatchObject({ ok: true, ignored: true });
    expect(await (await POST(req({ type: "email.delivered", data: {} }))).json()).toMatchObject({ ignored: true });
    vi.mocked(db.emailLog.findFirst).mockResolvedValue(null as never);
    expect(await (await POST(req({ type: "email.delivered", data: { email_id: "unknown" } }))).json()).toMatchObject({ ignored: true });
    expect(db.emailLog.update).not.toHaveBeenCalled();
  });

  it("rejects a signed but malformed body, and asks Resend to retry on a database error", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    vi.mocked(db.emailLog.findFirst).mockRejectedValue(new Error("db down"));
    expect((await POST(req({ type: "email.delivered", data: { email_id: "e1" } }))).status).toBe(500);
  });
});
