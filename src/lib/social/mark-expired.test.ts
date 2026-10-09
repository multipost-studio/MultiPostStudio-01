import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/env", () => ({ requireAuthSecret: () => "test-secret-test-secret-test-secret!!", env: {}, appUrl: (p = "") => `https://app.test${p}` }));
vi.mock("@/lib/db", () => ({ db: { socialAccount: { updateMany: vi.fn() } } }));
vi.mock("@/lib/notifications/account-notify", () => ({ notifyAccountExpired: vi.fn().mockResolvedValue(undefined) }));

import { db } from "@/lib/db";
import { notifyAccountExpired } from "@/lib/notifications/account-notify";
import { markAccountExpired } from "./oauth";

beforeEach(() => vi.clearAllMocks());

describe("markAccountExpired", () => {
  it("tells the team only on the real transition to expired", async () => {
    vi.mocked(db.socialAccount.updateMany).mockResolvedValueOnce({ count: 1 } as never);
    await markAccountExpired("a1");
    expect(notifyAccountExpired).toHaveBeenCalledWith("a1");
    expect(vi.mocked(db.socialAccount.updateMany).mock.calls[0][0]).toEqual({ where: { id: "a1", status: { not: "expired" } }, data: { status: "expired" } });
  });

  it("stays silent when the account was already expired (a dead token failing every tick)", async () => {
    vi.mocked(db.socialAccount.updateMany).mockResolvedValueOnce({ count: 0 } as never);
    await markAccountExpired("a1");
    expect(notifyAccountExpired).not.toHaveBeenCalled();
  });
});
