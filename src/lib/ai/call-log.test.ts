import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: { aiCallLog: { create: vi.fn() } } }));

import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { recordAiCall } from "./call-log";

const base = { workspaceId: "w1", provider: "openai", model: "gpt-x", ok: true, latencyMs: 1200, inputChars: 400, outputChars: 900 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.aiCallLog.create).mockResolvedValue({} as never);
});

describe("recordAiCall", () => {
  it("stores sizes and timing but nothing of the prompt or answer", async () => {
    recordAiCall(base);
    const data = vi.mocked(db.aiCallLog.create).mock.calls[0][0].data;
    expect(data).toEqual({ workspaceId: "w1", provider: "openai", model: "gpt-x", ok: true, reason: null, latencyMs: 1200, inputChars: 400, outputChars: 900 });
  });

  it("keeps the failure reason only for failed calls", () => {
    recordAiCall({ ...base, ok: false, reason: "invalid_key", outputChars: 0 });
    expect(vi.mocked(db.aiCallLog.create).mock.calls[0][0].data).toMatchObject({ ok: false, reason: "invalid_key" });
    recordAiCall({ ...base, ok: true, reason: "ignored" });
    expect(vi.mocked(db.aiCallLog.create).mock.calls[1][0].data).toMatchObject({ reason: null });
    recordAiCall({ ...base, ok: false });
    expect(vi.mocked(db.aiCallLog.create).mock.calls[2][0].data).toMatchObject({ reason: "unknown" });
  });

  it("clamps absurd or invalid numbers instead of failing the insert", () => {
    recordAiCall({ ...base, latencyMs: NaN, inputChars: -5, outputChars: 1e15 });
    expect(vi.mocked(db.aiCallLog.create).mock.calls[0][0].data).toMatchObject({ latencyMs: 0, inputChars: 0, outputChars: 10_000_000 });
  });

  it("never throws or rejects into the caller: a failed insert is only logged", async () => {
    vi.mocked(db.aiCallLog.create).mockRejectedValue(new Error("relation does not exist"));
    expect(() => recordAiCall(base)).not.toThrow();
    await new Promise((r) => setTimeout(r, 0));
    expect(logger.warn).toHaveBeenCalled();
  });

  it("survives a client without the table at all", () => {
    (db as unknown as { aiCallLog: unknown }).aiCallLog = undefined;
    expect(() => recordAiCall(base)).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
