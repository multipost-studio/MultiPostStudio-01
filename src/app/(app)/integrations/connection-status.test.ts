import { describe, it, expect } from "vitest";
import { connectionStatus, oauthErrorMessage } from "./connection-status";

describe("connectionStatus", () => {
  it("maps every SocialAccount.status to human copy", () => {
    // Values come from prisma/schema.prisma SocialAccount.status.
    expect(connectionStatus("connected")).toEqual({ label: "Connected", tone: "success" });
    for (const s of ["expired", "error", "disconnected"]) {
      const meta = connectionStatus(s);
      expect(meta.label).not.toBe(s); // never surface the raw machine value
      expect(meta.detail, `${s} needs an explanation`).toBeTruthy();
    }
  });

  it("only the healthy state omits an explanation", () => {
    expect(connectionStatus("connected").detail).toBeUndefined();
  });

  it("falls back visibly for an unknown status rather than throwing", () => {
    expect(connectionStatus("quarantined").label).toBe("quarantined");
    expect(connectionStatus("quarantined").tone).toBe("warning");
  });
});

describe("oauthErrorMessage", () => {
  // Codes produced by src/app/api/oauth/[platform]/{start,callback}.
  it("explains plan gating and names the platform", () => {
    const msg = oauthErrorMessage("tiktok-not-in-plan");
    expect(msg).toContain("Tiktok");
    expect(msg).toMatch(/plan/i);
  });

  it("distinguishes missing config from a failed handshake", () => {
    expect(oauthErrorMessage("pinterest-not-configured")).toMatch(/credentials|set up/i);
    expect(oauthErrorMessage("pinterest-connect-failed")).toMatch(/try connecting again/i);
  });

  it("covers the state and permission codes", () => {
    expect(oauthErrorMessage("expired-oauth-state")).toMatch(/expired/i);
    expect(oauthErrorMessage("invalid-oauth-state")).toMatch(/verified/i);
    expect(oauthErrorMessage("no-workspace")).toMatch(/workspace/i);
    expect(oauthErrorMessage("forbidden")).toMatch(/role|admin/i);
  });

  it("keeps an unrecognised provider reason visible instead of swallowing it", () => {
    expect(oauthErrorMessage("instagram: access_denied")).toContain("access_denied");
  });

  it("never returns an empty string", () => {
    for (const c of ["", "weird", "x-not-in-plan", "forbidden"]) {
      expect(oauthErrorMessage(c).length).toBeGreaterThan(0);
    }
  });
});
