import { describe, it, expect } from "vitest";
import { ProviderHttpError, chooseModel, classifyProviderError } from "./models";

describe("chooseModel", () => {
  it("takes an exact preference when the provider still offers it", () => {
    expect(chooseModel(["gpt-4o", "gpt-4o-mini"], ["gpt-4o-mini"])).toBe("gpt-4o-mini");
  });

  it("takes the newest match for a pattern", () => {
    const ids = ["gemini-1.5-flash", "gemini-2.0-flash", "gemini-2.5-flash", "gemini-2.5-pro"];
    expect(chooseModel(ids, [/^gemini-[\d.]+-flash$/])).toBe("gemini-2.5-flash");
  });

  it("skips preferences the provider no longer lists and falls through in order", () => {
    // The hard-coded favourite was retired: the next preference that exists is used.
    expect(chooseModel(["gpt-4.1-mini", "gpt-4o"], ["gpt-5-mini", "gpt-4.1-mini", "gpt-4o-mini"])).toBe("gpt-4.1-mini");
  });

  it("uses the fallback pattern last, and null when nothing fits", () => {
    expect(chooseModel(["claude-opus-5-5", "claude-haiku-4-5-20251001"], ["claude-sonnet-5-5"], /^claude-/)).toBe("claude-opus-5-5");
    expect(chooseModel(["something-else"], ["x"], /^claude-/)).toBeNull();
    expect(chooseModel([], ["x"])).toBeNull();
  });

  it("orders dated ids by their numbers, not as text", () => {
    expect(chooseModel(["claude-haiku-4-5-20251001", "claude-haiku-5-5"], [/^claude-haiku/])).toBe("claude-haiku-5-5");
    expect(chooseModel(["gemini-2.5-flash", "gemini-10.0-flash"], [/^gemini-[\d.]+-flash$/])).toBe("gemini-10.0-flash");
  });
});

describe("classifyProviderError", () => {
  const http = (status: number, body = "") => new ProviderHttpError("openai", status, body);

  it("tells a bad key from a retired model from a quota problem", () => {
    expect(classifyProviderError(http(401))).toBe("invalid_key");
    expect(classifyProviderError(http(403))).toBe("invalid_key");
    expect(classifyProviderError(http(404, "model not found"))).toBe("model_unavailable");
    expect(classifyProviderError(http(429))).toBe("quota");
    expect(classifyProviderError(http(402))).toBe("quota");
    expect(classifyProviderError(http(500))).toBe("provider_error");
  });

  it("reads a 400 about the model as an unavailable model, other 400s as a provider error", () => {
    expect(classifyProviderError(http(400, "The model `gemini-2.0-flash` is deprecated"))).toBe("model_unavailable");
    expect(classifyProviderError(http(400, "messages must be non-empty"))).toBe("provider_error");
  });

  it("understands SDK errors that carry a status, and treats no status as unreachable", () => {
    expect(classifyProviderError(Object.assign(new Error("x"), { status: 401 }))).toBe("invalid_key");
    expect(classifyProviderError(new Error("fetch failed"))).toBe("unreachable");
    expect(classifyProviderError(undefined)).toBe("unreachable");
  });
});
