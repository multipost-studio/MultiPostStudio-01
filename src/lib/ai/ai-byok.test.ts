import { describe, it, expect, vi, beforeEach } from "vitest";
import { ProviderHttpError } from "./models";

const adapter = vi.hoisted(() => ({
  id: "openai",
  label: "OpenAI",
  blurb: "",
  apiKeyUrl: "",
  defaultModel: "fallback-model",
  modelPreference: ["new-model"],
  modelFallback: /^m/,
  generateText: vi.fn(),
  validateCredentials: vi.fn(),
  listModels: vi.fn(),
}));

vi.mock("./providers/registry", () => ({
  getAiProviderAdapter: (id: string) => (id === "openai" ? adapter : null),
  isAiProviderId: (id: string) => id === "openai",
  AI_PROVIDER_IDS: ["openai"],
}));
vi.mock("@/lib/social/crypto", () => ({ encryptToken: (s: string) => `enc:${s}`, decryptToken: () => "SECRET_KEY" }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findUnique: vi.fn(), update: vi.fn() },
    aiProviderCredential: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { generateTextDetailed } from "./orchestrator";
import { connectAiCredential, testAiCredential } from "./credentials";

const http = (status: number, body = "") => new ProviderHttpError("openai", status, body);
const update = () => vi.mocked(db.aiProviderCredential.update);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.workspace.findUnique).mockResolvedValue({ defaultAiProvider: "openai" } as never);
  vi.mocked(db.aiProviderCredential.findUnique).mockResolvedValue({ id: "c1", status: "connected", encryptedApiKey: "enc", defaultModel: "old-model" } as never);
  update().mockResolvedValue({} as never);
  adapter.validateCredentials.mockResolvedValue({ ok: true });
  adapter.listModels.mockResolvedValue(["new-model", "m-other"]);
  adapter.generateText.mockResolvedValue({ text: "OK" });
});

describe("generating with the workspace's own key", () => {
  it("returns the model's text and the provider it came from", async () => {
    const out = await generateTextDetailed("w1", "sys", "usr", 100);
    expect(out).toEqual({ text: "OK", provider: "openai" });
    expect(adapter.generateText).toHaveBeenCalledWith(expect.objectContaining({ apiKey: "SECRET_KEY", model: "old-model", system: "sys", user: "usr" }));
  });

  it("says no_key when nothing is connected, and never calls a provider", async () => {
    vi.mocked(db.workspace.findUnique).mockResolvedValue({ defaultAiProvider: null } as never);
    expect(await generateTextDetailed("w1", "s", "u", 10)).toEqual({ text: null, reason: "no_key" });
    expect(adapter.generateText).not.toHaveBeenCalled();
  });

  it("marks a rejected key invalid so Settings stops saying Connected", async () => {
    adapter.generateText.mockRejectedValue(http(401));
    const out = await generateTextDetailed("w1", "s", "u", 10);
    expect(out).toMatchObject({ text: null, reason: "invalid_key" });
    expect(update()).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "invalid" } });
  });

  it("reports quota without touching the credential", async () => {
    adapter.generateText.mockRejectedValue(http(429));
    expect(await generateTextDetailed("w1", "s", "u", 10)).toMatchObject({ text: null, reason: "quota" });
    expect(update()).not.toHaveBeenCalled();
  });

  it("repairs a retired model on the spot: re-picks, remembers it, retries once", async () => {
    adapter.generateText.mockRejectedValueOnce(http(404, "model not found")).mockResolvedValueOnce({ text: "fixed" });
    const out = await generateTextDetailed("w1", "s", "u", 10);
    expect(out).toEqual({ text: "fixed", provider: "openai" });
    expect(adapter.generateText).toHaveBeenLastCalledWith(expect.objectContaining({ model: "new-model" }));
    expect(update()).toHaveBeenCalledWith({ where: { id: "c1" }, data: { defaultModel: "new-model" } });
  });

  it("gives up with model_unavailable when the provider offers nothing better", async () => {
    adapter.listModels.mockResolvedValue(["old-model"]);
    adapter.generateText.mockRejectedValue(http(404));
    const out = await generateTextDetailed("w1", "s", "u", 10);
    expect(out).toMatchObject({ text: null, reason: "model_unavailable" });
    expect(adapter.generateText).toHaveBeenCalledTimes(1);
  });

  it("treats a blank answer as empty, not as success", async () => {
    adapter.generateText.mockResolvedValue({ text: "   " });
    expect(await generateTextDetailed("w1", "s", "u", 10)).toMatchObject({ text: null, reason: "empty" });
  });
});

describe("Test Connection", () => {
  it("proves a real generation works, not just that the key authenticates", async () => {
    const res = await testAiCredential("w1", "openai");
    expect(res).toEqual({ ok: true, model: "old-model", healed: false });
    expect(adapter.generateText).toHaveBeenCalledOnce();
  });

  it("a key that lists models but cannot generate is not 'working'", async () => {
    adapter.generateText.mockRejectedValue(http(500));
    const res = await testAiCredential("w1", "openai");
    expect(res).toEqual({ ok: false, reason: "unknown" });
  });

  it("marks a rejected key invalid, but not a quota problem", async () => {
    adapter.validateCredentials.mockResolvedValue({ ok: false, reason: "invalid_key" });
    expect(await testAiCredential("w1", "openai")).toEqual({ ok: false, reason: "invalid_key" });
    expect(update()).toHaveBeenCalledWith({ where: { id: "c1" }, data: { status: "invalid", lastValidatedAt: expect.any(Date) } });
    update().mockClear();
    adapter.validateCredentials.mockResolvedValue({ ok: true });
    adapter.generateText.mockRejectedValue(http(429));
    expect(await testAiCredential("w1", "openai")).toEqual({ ok: false, reason: "quota" });
    expect(update()).not.toHaveBeenCalled();
  });

  it("heals a retired model and says so", async () => {
    adapter.generateText.mockRejectedValueOnce(http(404, "model not found")).mockResolvedValueOnce({ text: "OK" });
    const res = await testAiCredential("w1", "openai");
    expect(res).toEqual({ ok: true, model: "new-model", healed: true });
  });
});

describe("connecting a key", () => {
  it("stores the model the provider offers today, not a typed-in id", async () => {
    vi.mocked(db.aiProviderCredential.upsert).mockResolvedValue({ id: "c1" } as never);
    vi.mocked(db.workspace.findUnique).mockResolvedValue({ defaultAiProvider: "openai" } as never);
    const res = await connectAiCredential("w1", "u1", "openai", "  sk-abc1234  ");
    expect(res.ok).toBe(true);
    const arg = vi.mocked(db.aiProviderCredential.upsert).mock.calls[0]?.[0];
    expect(arg?.create).toMatchObject({ defaultModel: "new-model", keyLast4: "1234", encryptedApiKey: "enc:sk-abc1234" });
    expect(arg?.update).toMatchObject({ defaultModel: "new-model" });
  });

  it("falls back to the adapter default if the model list cannot be fetched, instead of failing to connect", async () => {
    adapter.listModels.mockRejectedValue(new Error("network"));
    vi.mocked(db.aiProviderCredential.upsert).mockResolvedValue({ id: "c1" } as never);
    const res = await connectAiCredential("w1", "u1", "openai", "sk-abc1234");
    expect(res.ok).toBe(true);
    expect(vi.mocked(db.aiProviderCredential.upsert).mock.calls[0]?.[0]?.create).toMatchObject({ defaultModel: "fallback-model" });
  });

  it("refuses a key the provider rejects, saving nothing", async () => {
    adapter.validateCredentials.mockResolvedValue({ ok: false, reason: "invalid_key" });
    expect(await connectAiCredential("w1", "u1", "openai", "bad")).toEqual({ ok: false, reason: "invalid_key" });
    expect(db.aiProviderCredential.upsert).not.toHaveBeenCalled();
  });
});
