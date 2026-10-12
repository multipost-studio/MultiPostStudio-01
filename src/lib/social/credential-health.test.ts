import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { isRealToken } from "@/lib/social/crypto";

let production = true;

vi.mock("@/lib/env", () => ({
  get isProduction() {
    return production;
  },
}));
vi.mock("@/lib/social/crypto", () => ({ isRealToken: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { socialAccount: { findMany: vi.fn() } } }));

import { accountsNeedingReconnect } from "./credential-health";

const rows = [
  { id: "ig", accessToken: "enc-ig" },
  { id: "fb", accessToken: "enc-fb" },
  { id: "pin", accessToken: "enc-pin" },
];

beforeEach(() => {
  production = true;
  vi.mocked(db.socialAccount.findMany).mockReset().mockResolvedValue(rows as never);
  vi.mocked(isRealToken).mockReset().mockImplementation((t) => t === "enc-pin");
});

describe("accountsNeedingReconnect", () => {
  it("lists connected accounts whose saved login cannot be used, and only those", async () => {
    const r = await accountsNeedingReconnect("ws1");
    expect([...r.ids].sort()).toEqual(["fb", "ig"]);
    expect(r.configProblem).toBe(false);
  });

  it("only looks at accounts that claim to be connected, in this workspace", async () => {
    await accountsNeedingReconnect("ws1");
    expect(vi.mocked(db.socialAccount.findMany).mock.calls[0][0]).toMatchObject({ where: { workspaceId: "ws1", status: "connected" } });
  });

  it("reports nothing when every login is usable", async () => {
    vi.mocked(isRealToken).mockReturnValue(true);
    expect((await accountsNeedingReconnect("ws1")).ids.size).toBe(0);
  });

  it("reports a server problem, not a list of accounts, when decryption is impossible for everyone", async () => {
    vi.mocked(isRealToken).mockImplementation(() => {
      throw new Error("TOKEN_ENC_KEY is not configured");
    });
    const r = await accountsNeedingReconnect("ws1");
    expect(r.configProblem).toBe(true);
    expect(r.ids.size).toBe(0);
  });

  it("outside production placeholder accounts are legitimate demos: nothing reported, nothing read", async () => {
    production = false;
    const r = await accountsNeedingReconnect("ws1");
    expect(r.ids.size).toBe(0);
    expect(db.socialAccount.findMany).not.toHaveBeenCalled();
  });
});
