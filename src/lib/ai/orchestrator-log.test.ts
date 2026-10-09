import { beforeEach, describe, expect, it, vi } from "vitest";
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
const logged = vi.hoisted(() => vi.fn());

vi.mock("./providers/registry", () => ({
  getAiProviderAdapter: (id: string) => (id === "openai" ? adapter : null),
  isAiProviderId: (id: string) => id === "openai",
  AI_PROVIDER_IDS: ["openai"],
}));
vi.mock("./call-log", () => ({ recordAiCall: logged, AI_LOG_RETENTION_DAYS: 90 }));
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.workspace.findUnique).mockResolvedValue({ defaultAiProvider: "openai" } as never);
  vi.mocked(db.aiProviderCredential.findUnique).mockResolvedValue({ id: "c1", status: "connected", encryptedApiKey: "enc", defaultModel: "old-model" } as never);
  vi.mocked(db.aiProviderCredential.update).mockResolvedValue({} as never);
  adapter.listModels.mockResolvedValue(["new-model"]);
  adapter.generateText.mockResolvedValue({ text: "Hello there" });
});

describe("AI call log from the orchestrator", () => {
  it("logs a successful call with sizes and timing, never the text", async () => {
    await generateTextDetailed("w1", "sys", "user prompt", 100);
    expect(logged).toHaveBeenCalledTimes(1);
    const e = logged.mock.calls[0][0];
    expect(e).toMatchObject({ workspaceId: "w1", provider: "openai", model: "old-model", ok: true, inputChars: "sys".length + "user prompt".length, outputChars: "Hello there".length });
    expect(e.latencyMs).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(e)).not.toContain("Hello there");
    expect(JSON.stringify(e)).not.toContain("user prompt");
  });

  it("logs a failure with its class", async () => {
    adapter.generateText.mockRejectedValue(new ProviderHttpError("openai", 401, ""));
    await generateTextDetailed("w1", "s", "u", 10);
    expect(logged.mock.calls[0][0]).toMatchObject({ ok: false, reason: "invalid_key", outputChars: 0 });
  });

  it("logs an empty answer as a failure", async () => {
    adapter.generateText.mockResolvedValue({ text: "   " });
    await generateTextDetailed("w1", "s", "u", 10);
    expect(logged.mock.calls[0][0]).toMatchObject({ ok: false, reason: "empty" });
  });

  it("logs the retry too when a retired model is replaced", async () => {
    adapter.generateText.mockRejectedValueOnce(new ProviderHttpError("openai", 404, "model not found")).mockResolvedValueOnce({ text: "OK" });
    await generateTextDetailed("w1", "s", "u", 10);
    expect(logged.mock.calls.map((c) => [c[0].model, c[0].ok])).toEqual([
      ["old-model", false],
      ["new-model", true],
    ]);
  });

  it("logs nothing when no provider is connected", async () => {
    vi.mocked(db.workspace.findUnique).mockResolvedValue({ defaultAiProvider: null } as never);
    await generateTextDetailed("w1", "s", "u", 10);
    expect(logged).not.toHaveBeenCalled();
  });
});
