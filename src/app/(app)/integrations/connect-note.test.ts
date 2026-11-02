import { describe, it, expect } from "vitest";
import { connectNote } from "./connection-status";

describe("connectNote", () => {
  it("tells the truth about Instagram: the sign-in is Facebook's, and what the account needs to be", () => {
    const n = connectNote("instagram", "Instagram");
    expect(n).toMatch(/Facebook/);
    expect(n).toMatch(/Business or Creator/);
    expect(n).toMatch(/Page/);
    expect(n).not.toMatch(/sent to Instagram/);
  });

  it("with Instagram Login on, sends people to Instagram and no longer mentions a Facebook Page", () => {
    const n = connectNote("instagram", "Instagram", true);
    expect(n).toMatch(/sign in on Instagram/);
    expect(n).toMatch(/Business or Creator/);
    expect(n).not.toMatch(/Facebook|Page/);
  });

  it("says Facebook for Facebook and Google for the Google platforms", () => {
    expect(connectNote("facebook", "Facebook")).toMatch(/Facebook/);
    expect(connectNote("youtube", "YouTube")).toMatch(/Google/);
    expect(connectNote("gbp", "Google Business Profile")).toMatch(/Google/);
  });

  it("names the platform for every other one", () => {
    expect(connectNote("pinterest", "Pinterest")).toBe("You'll be sent to Pinterest to authorize MultiPost Studio, then back here.");
    expect(connectNote("linkedin", "LinkedIn")).toContain("LinkedIn");
  });
});
