import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {}, requireAuthSecret: () => "test-secret-test-secret-test-secret!!" }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { fetchGbpAllLocations, gbpSetupHint, GbpApiError } from "./gbp";
import { isDeadTokenError } from "@/lib/social/oauth";

const res = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

afterEach(() => vi.restoreAllMocks());

describe("setup problems are explained, not shown as 'try again later' or 'no locations'", () => {
  it("zero quota means Google hasn't approved the project", () => {
    const body = JSON.stringify({ error: { code: 429, message: "Quota exceeded for quota metric 'Requests' and limit 'Requests per minute' of service 'mybusinessaccountmanagement.googleapis.com'", details: [{ metadata: { quota_limit_value: "0" } }] } });
    expect(gbpSetupHint(429, body)).toMatch(/hasn't approved this project/i);
  });

  it("a real rate limit still reads as a rate limit", () => {
    const body = JSON.stringify({ error: { code: 429, message: "Quota exceeded for quota metric 'Requests'", details: [{ metadata: { quota_limit_value: "60" } }] } });
    expect(gbpSetupHint(429, body)).toBeNull();
  });

  it("a switched-off API names the three APIs to enable", () => {
    const body = JSON.stringify({ error: { code: 403, status: "PERMISSION_DENIED", message: "My Business Account Management API has not been used in project 123 before or it is disabled.", details: [{ reason: "SERVICE_DISABLED" }] } });
    const h = gbpSetupHint(403, body)!;
    expect(h).toMatch(/switched off/i);
    expect(h).toContain("Business Profile Performance API");
  });

  it("other errors get no hint", () => {
    expect(gbpSetupHint(500, "boom")).toBeNull();
    expect(gbpSetupHint(403, JSON.stringify({ error: { message: "The caller does not have permission" } }))).toBeNull();
  });
});

describe("fetchGbpAllLocations", () => {
  const accountsOk = () => res(200, { accounts: [{ name: "accounts/1", accountName: "A", type: "PERSONAL" }, { name: "accounts/2", accountName: "B", type: "PERSONAL" }] });

  it("reports the failure when every account's locations fail, instead of returning an empty list", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    f.mockResolvedValueOnce(accountsOk()).mockResolvedValue(res(403, { error: { message: "has not been used in project 9 before or it is disabled", details: [{ reason: "SERVICE_DISABLED" }] } }));
    await expect(fetchGbpAllLocations("tok")).rejects.toBeInstanceOf(GbpApiError);
  });

  it("keeps the accounts that worked when only some fail", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    f.mockResolvedValueOnce(accountsOk())
      .mockResolvedValueOnce(res(200, { locations: [{ name: "locations/10", title: "Cafe" }] }))
      .mockResolvedValueOnce(res(403, { error: { message: "no access" } }));
    const r = await fetchGbpAllLocations("tok");
    expect(r.locations.map((l) => l.name)).toEqual(["locations/10"]);
  });

  it("an account with no locations is simply empty, not an error", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    f.mockResolvedValueOnce(res(200, { accounts: [{ name: "accounts/1", accountName: "A", type: "PERSONAL" }] })).mockResolvedValueOnce(res(200, {}));
    expect((await fetchGbpAllLocations("tok")).locations).toEqual([]);
  });
});

describe("a dead Google Business Profile grant is recognised, so the account is flagged for reconnecting", () => {
  it("matches the message the GBP client produces on a 401", () => {
    expect(isDeadTokenError("Google Business Profile authorization expired — reconnect")).toBe(true);
  });
  it("does not swallow unrelated errors", () => {
    expect(isDeadTokenError("Google Business Profile service is temporarily unavailable (503)")).toBe(false);
  });
});
