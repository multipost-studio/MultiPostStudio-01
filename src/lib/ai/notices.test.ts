import { describe, it, expect } from "vitest";
import { templatedNotice, type AiFallback } from "./notices";

describe("templatedNotice", () => {
  const reasons: AiFallback[] = ["disabled", "no_key", "empty", "invalid_key", "quota", "model_unavailable", "unreachable", "provider_error"];

  it("always says nothing was charged and gives a next step or cause", () => {
    for (const r of reasons) expect(templatedNotice(r)).toMatch(/no AI credits were used/);
    expect(templatedNotice(undefined)).toMatch(/templated/);
  });

  it("points a missing key at the AI Providers page, and a bad key at reconnecting", () => {
    expect(templatedNotice("no_key")).toMatch(/Connect your own key in Settings → AI Providers/);
    expect(templatedNotice("invalid_key")).toMatch(/Reconnect/);
    expect(templatedNotice("model_unavailable")).toMatch(/Test Connection/);
  });

  it("gives each failure its own message", () => {
    const set = new Set(["no_key", "invalid_key", "quota", "model_unavailable", "provider_error", "disabled"].map((r) => templatedNotice(r as AiFallback)));
    expect(set.size).toBe(6);
  });
});
