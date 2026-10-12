import { beforeEach, describe, expect, it, vi } from "vitest";
import { templatedNotice } from "./notices";

const adapter = vi.hoisted(() => ({
  id: "openai", label: "OpenAI", blurb: "", apiKeyUrl: "", defaultModel: "m", modelPreference: [], modelFallback: /^m/,
  generateText: vi.fn(), validateCredentials: vi.fn(), listModels: vi.fn(),
}));
const paused = vi.hoisted(() => vi.fn<(...a: unknown[]) => Promise<string | null>>());

vi.mock("./providers/registry", () => ({
  getAiProviderAdapter: (id: string) => (id === "openai" ? adapter : null),
  isAiProviderId: (id: string) => id === "openai",
  AI_PROVIDER_IDS: ["openai"],
}));
vi.mock("./call-log", () => ({ recordAiCall: vi.fn(), AI_LOG_RETENTION_DAYS: 90 }));
vi.mock("@/lib/kill-switches", () => ({ pausedMessage: (...a: unknown[]) => paused(...a) }));
vi.mock("@/lib/social/crypto", () => ({ encryptToken: (s: string) => s, decryptToken: () => "KEY" }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({
  db: {
    workspace: { findUnique: vi.fn(async () => ({ defaultAiProvider: "openai", orgId: "org1" })), update: vi.fn() },
    aiProviderCredential: { findUnique: vi.fn(async () => ({ id: "c1", status: "connected", encryptedApiKey: "enc", defaultModel: "m" })), update: vi.fn(async () => ({})), upsert: vi.fn() },
  },
}));

import { generateTextDetailed } from "./orchestrator";

beforeEach(() => {
  vi.clearAllMocks();
  paused.mockResolvedValue(null);
  adapter.generateText.mockResolvedValue({ text: "hello" });
});

describe("AI kill switch in the orchestrator", () => {
  it("returns a paused outcome and never calls the provider", async () => {
    paused.mockResolvedValue("AI features are paused");
    expect(await generateTextDetailed("w1", "s", "u", 10)).toEqual({ text: null, reason: "paused", provider: "openai" });
    expect(adapter.generateText).not.toHaveBeenCalled();
  });

  it("asks about this provider and resolves the organization lazily", async () => {
    await generateTextDetailed("w1", "s", "u", 10);
    const [kind, ctx] = paused.mock.calls[0] as [string, { orgId: () => Promise<string | null>; providers: string[] }];
    expect(kind).toBe("ai");
    expect(ctx.providers).toEqual(["openai"]);
    expect(await ctx.orgId()).toBe("org1");
  });

  it("works normally when nothing is paused", async () => {
    expect(await generateTextDetailed("w1", "s", "u", 10)).toEqual({ text: "hello", provider: "openai" });
  });

  it("the customer is told AI is paused, not that it is unconfigured", () => {
    expect(templatedNotice("paused")).toMatch(/paused/);
    expect(templatedNotice("paused")).not.toMatch(/isn't configured/);
  });
});
