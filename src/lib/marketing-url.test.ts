import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { marketingUrl } from "./env";

describe("marketingUrl", () => {
  it("drops the app. prefix: the landing page lives on the bare domain", () => {
    expect(marketingUrl("https://app.multipoststudio.online")).toBe("https://multipoststudio.online/");
    expect(marketingUrl("https://app.multipoststudio.online/dashboard?x=1")).toBe("https://multipoststudio.online/");
  });

  it("leaves a host without an app. prefix alone (local dev, preview deployments serve the site at their root)", () => {
    expect(marketingUrl("http://localhost:3000")).toBe("http://localhost:3000/");
    expect(marketingUrl("https://multipost-studio.vercel.app")).toBe("https://multipost-studio.vercel.app/");
  });

  it("does not strip app from the middle of a name", () => {
    expect(marketingUrl("https://myapp.example.com")).toBe("https://myapp.example.com/");
  });

  it("falls back to a relative root when the base is not a URL", () => {
    expect(marketingUrl("not a url")).toBe("/");
  });
});

// Google signs in whichever account the browser already uses unless it is told to show the chooser. This pins that setting,
// because nothing else would notice it being dropped.
describe("Google sign-in", () => {
  it("always asks Google to show the account chooser", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "auth.ts"), "utf8");
    expect(src).toMatch(/authorization:\s*\{\s*params:\s*\{\s*prompt:\s*"select_account"/);
  });
});
