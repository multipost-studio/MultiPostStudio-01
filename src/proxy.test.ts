import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("next-auth/jwt", () => ({ getToken: vi.fn(async () => null) }));
vi.mock("@/lib/env", () => ({ requireAuthSecret: () => "test-secret-test-secret-test-secret!!" }));

import { proxy } from "./proxy";

const at = (host: string, path: string, cookie?: string) =>
  new NextRequest(`https://${host}${path}`, { headers: { host, ...(cookie ? { cookie } : {}) } });

describe("proxy: marketing host sends account pages to the app host", () => {
  it.each(["/login", "/signup", "/forgot", "/reset", "/verify", "/dashboard", "/notifications"])("%s", async (p) => {
    const res = await proxy(at("multipoststudio.online", `${p}?token=abc`));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(`https://app.multipoststudio.online${p}?token=abc`);
  });

  it("leaves marketing pages alone", async () => {
    const res = await proxy(at("multipoststudio.online", "/pricing"));
    expect(res.headers.get("location")).toBeNull();
  });
});

describe("proxy: app host", () => {
  it("sends a signed-out visitor from a protected page to login, remembering where they were going", async () => {
    const res = await proxy(at("app.multipoststudio.online", "/notifications"));
    const loc = new URL(res.headers.get("location")!);
    expect(loc.pathname).toBe("/login");
    expect(loc.searchParams.get("next")).toBe("/notifications");
  });

  it("lets a signed-in visitor through", async () => {
    const res = await proxy(at("app.multipoststudio.online", "/notifications", "authjs.session-token=x"));
    expect(res.headers.get("location")).toBeNull();
  });
});
