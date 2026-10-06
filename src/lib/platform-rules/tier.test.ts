import { describe, expect, it } from "vitest";
import { accountTierFor, xTierFromSubscription } from "./tier";

describe("account tier", () => {
  it("maps X subscription types", () => {
    expect(xTierFromSubscription("None")).toBe("standard");
    for (const s of ["Basic", "Premium", "PremiumPlus", "premiumplus"]) expect(xTierFromSubscription(s)).toBe("premium");
    expect(xTierFromSubscription(undefined)).toBe("unknown");
    expect(xTierFromSubscription("SomethingNew")).toBe("unknown");
    expect(xTierFromSubscription(42)).toBe("unknown");
  });

  it("reads it from stored account metadata and never throws on bad json", () => {
    expect(accountTierFor("x", JSON.stringify({ xSubscriptionType: "Premium" }))).toBe("premium");
    expect(accountTierFor("x", JSON.stringify({ remoteId: "1" }))).toBe("unknown");
    expect(accountTierFor("x", "{not json")).toBe("unknown");
    expect(accountTierFor("x", null)).toBe("unknown");
    expect(accountTierFor("instagram", JSON.stringify({ xSubscriptionType: "Premium" }))).toBe("unknown");
  });
});
