import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const store = vi.hoisted(() => ({ requests: [] as Row[], tokens: [] as Row[], allowed: true, created: new Date("2026-11-02T12:00:00Z") }));

const matches = (row: Row, where: Row): boolean =>
  Object.entries(where).every(([k, v]) => {
    if (k === "OR") return (v as Row[]).some((w) => matches(row, w));
    if (v && typeof v === "object" && "gte" in (v as Row)) return (row[k] as Date) >= ((v as Row).gte as Date);
    return v === null ? row[k] == null : row[k] === v;
  });

vi.mock("@/lib/db", () => ({
  db: {
    oAuthAuthRequest: {
      findUnique: vi.fn(async ({ where }: { where: Row }) => store.requests.find((r) => matches(r, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = store.requests.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    oAuthToken: {
      create: vi.fn(async ({ data }: { data: Row }) => {
        const t = { id: `t${store.tokens.length + 1}`, revokedAt: null, prevRefreshHash: null, createdAt: store.created, ...data };
        store.tokens.push(t);
        return t;
      }),
      findUnique: vi.fn(async ({ where }: { where: Row }) => store.tokens.find((t) => matches(t, where)) ?? null),
      findFirst: vi.fn(async ({ where }: { where: Row }) => store.tokens.find((t) => matches(t, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: Row; data: Row }) => {
        const hit = store.tokens.filter((t) => matches(t, where));
        hit.forEach((t) => Object.assign(t, data));
        return { count: hit.length };
      }),
    },
  },
}));

vi.mock("./grant", () => ({ grantStillAllowed: vi.fn(async () => store.allowed) }));

import { handleTokenRequest, revokeToken } from "./token-service";

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const verifier = "v".repeat(50);
const challenge = createHash("sha256").update(verifier).digest("base64url");
const NOW = new Date("2026-11-02T12:00:00Z");

function approvedRequest(over: Row = {}): Row {
  return {
    id: "req1",
    clientId: "mpc_a",
    redirectUri: "https://claude.ai/cb",
    codeChallenge: challenge,
    state: "s",
    userId: "u1",
    orgId: "o1",
    workspaceId: null,
    grantedScopes: JSON.stringify(["posts:read", "channels:read"]),
    codeHash: sha("CODE"),
    codeExpiresAt: new Date(NOW.getTime() + 60_000),
    usedAt: null,
    ...over,
  };
}
const exchange = (over: Record<string, string> = {}) =>
  new URLSearchParams({ grant_type: "authorization_code", client_id: "mpc_a", code: "CODE", redirect_uri: "https://claude.ai/cb", code_verifier: verifier, ...over });

beforeEach(() => {
  store.requests = [approvedRequest()];
  store.tokens = [];
  store.allowed = true;
});

describe("authorization_code", () => {
  it("trades a good code for tokens, stores only hashes, and uses the code up", async () => {
    const out = await handleTokenRequest(exchange(), NOW);
    expect(out.status).toBe(200);
    expect(out.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "posts:read channels:read" });
    const access = String(out.body.access_token);
    expect(access).toMatch(/^mpo_/);
    expect(String(out.body.refresh_token)).toMatch(/^mpr_/);
    expect(store.tokens).toHaveLength(1);
    expect(store.tokens[0]).toMatchObject({ accessHash: sha(access), orgId: "o1", userId: "u1", workspaceId: null });
    expect(JSON.stringify(store.tokens)).not.toContain(access); // the value itself is never stored

    const again = await handleTokenRequest(exchange(), NOW);
    expect(again.status).toBe(400);
    expect(again.body.error).toBe("invalid_grant");
    expect(store.tokens).toHaveLength(1);
  });

  it("refuses a wrong verifier, client or redirect address, and an expired code", async () => {
    expect((await handleTokenRequest(exchange({ code_verifier: "w".repeat(50) }), NOW)).body.error).toBe("invalid_grant");
    expect((await handleTokenRequest(exchange({ client_id: "mpc_other" }), NOW)).body.error).toBe("invalid_grant");
    expect((await handleTokenRequest(exchange({ redirect_uri: "https://evil.example/cb" }), NOW)).body.error).toBe("invalid_grant");
    expect((await handleTokenRequest(exchange({ code: "NOPE" }), NOW)).body.error).toBe("invalid_grant");
    store.requests = [approvedRequest({ codeExpiresAt: new Date(NOW.getTime() - 1) })];
    expect((await handleTokenRequest(exchange(), NOW)).body.error).toBe("invalid_grant");
    expect(store.tokens).toHaveLength(0);
  });

  it("refuses a request that was never approved", async () => {
    store.requests = [approvedRequest({ userId: null, orgId: null, grantedScopes: null })];
    expect((await handleTokenRequest(exchange(), NOW)).body.error).toBe("invalid_grant");
  });

  it("lets only one of two simultaneous exchanges win", async () => {
    const [a, b] = await Promise.all([handleTokenRequest(exchange(), NOW), handleTokenRequest(exchange(), NOW)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
    expect(store.tokens).toHaveLength(1);
  });

  it("asks for what is missing", async () => {
    expect((await handleTokenRequest(new URLSearchParams({ client_id: "mpc_a" }), NOW)).body.error).toBe("invalid_request");
    expect((await handleTokenRequest(new URLSearchParams({ grant_type: "authorization_code" }), NOW)).body.error).toBe("invalid_request");
    expect((await handleTokenRequest(exchange({ code_verifier: "" }), NOW)).body.error).toBe("invalid_request");
    expect((await handleTokenRequest(new URLSearchParams({ grant_type: "password", client_id: "mpc_a" }), NOW)).body.error).toBe("unsupported_grant_type");
  });
});

describe("refresh_token", () => {
  async function connected() {
    const out = await handleTokenRequest(exchange(), NOW);
    return { access: String(out.body.access_token), refresh: String(out.body.refresh_token) };
  }
  const refreshWith = (refresh: string, clientId = "mpc_a") => new URLSearchParams({ grant_type: "refresh_token", client_id: clientId, refresh_token: refresh });

  it("issues new tokens and retires the old refresh token", async () => {
    const first = await connected();
    const out = await handleTokenRequest(refreshWith(first.refresh), NOW);
    expect(out.status).toBe(200);
    expect(out.body.access_token).not.toBe(first.access);
    expect(out.body.refresh_token).not.toBe(first.refresh);
    expect(store.tokens).toHaveLength(1); // rotated in place, not duplicated
    expect(store.tokens[0].accessHash).toBe(sha(String(out.body.access_token)));

    expect((await handleTokenRequest(refreshWith(first.refresh), NOW)).body.error).toBe("invalid_grant");
  });

  it("refuses another client, a revoked connection and an expired refresh token", async () => {
    const first = await connected();
    expect((await handleTokenRequest(refreshWith(first.refresh, "mpc_other"), NOW)).body.error).toBe("invalid_grant");
    store.tokens[0].refreshExpiresAt = new Date(NOW.getTime() - 1);
    expect((await handleTokenRequest(refreshWith(first.refresh), NOW)).body.error).toBe("invalid_grant");
    store.tokens[0].refreshExpiresAt = new Date(NOW.getTime() + 1000);
    store.tokens[0].revokedAt = NOW;
    expect((await handleTokenRequest(refreshWith(first.refresh), NOW)).body.error).toBe("invalid_grant");
  });

  it("lets only one of two simultaneous refreshes win", async () => {
    const first = await connected();
    const [a, b] = await Promise.all([handleTokenRequest(refreshWith(first.refresh), NOW), handleTokenRequest(refreshWith(first.refresh), NOW)]);
    expect([a.status, b.status].sort()).toEqual([200, 400]);
  });
});

describe("keeping a connection safe", () => {
  const refreshWith = (refresh: string) => new URLSearchParams({ grant_type: "refresh_token", client_id: "mpc_a", refresh_token: refresh });

  it("a code presented a second time ends the connection it was already traded for", async () => {
    await handleTokenRequest(exchange(), NOW);
    expect(store.tokens[0].revokedAt).toBeNull();
    const replay = await handleTokenRequest(exchange(), NOW);
    expect(replay.body.error).toBe("invalid_grant");
    expect(store.tokens[0].revokedAt).toBeInstanceOf(Date);
  });

  it("an old refresh token shown again means a copy was used: the whole connection is cut off", async () => {
    const first = await handleTokenRequest(exchange(), NOW);
    const second = await handleTokenRequest(refreshWith(String(first.body.refresh_token)), NOW);
    expect(second.status).toBe(200);
    const replayed = await handleTokenRequest(refreshWith(String(first.body.refresh_token)), NOW);
    expect(replayed.body.error).toBe("invalid_grant");
    expect(store.tokens[0].revokedAt).toBeInstanceOf(Date);
    expect((await handleTokenRequest(refreshWith(String(second.body.refresh_token)), NOW)).body.error).toBe("invalid_grant");
  });

  it("refreshing re-checks that the person who approved it still may, and ends the connection if not", async () => {
    const first = await handleTokenRequest(exchange(), NOW);
    store.allowed = false;
    expect((await handleTokenRequest(refreshWith(String(first.body.refresh_token)), NOW)).body.error).toBe("invalid_grant");
    expect(store.tokens[0].revokedAt).toBeInstanceOf(Date);
  });

  it("a connection can't refresh forever: there is an absolute limit from when it was approved", async () => {
    const first = await handleTokenRequest(exchange(), NOW);
    const later = new Date(NOW.getTime() + 170 * 86_400_000); // 170 days in: the sliding 30 days would run past 180
    store.tokens[0].refreshExpiresAt = new Date(later.getTime() + 86_400_000);
    await handleTokenRequest(refreshWith(String(first.body.refresh_token)), later);
    const limit = (store.created as Date).getTime() + 180 * 86_400_000;
    expect((store.tokens[0].refreshExpiresAt as Date).getTime()).toBe(limit);
  });
});

describe("revocation", () => {
  it("revokes by access or refresh token and says nothing for unknown ones", async () => {
    const out = await handleTokenRequest(exchange(), NOW);
    await revokeToken(String(out.body.refresh_token));
    expect(store.tokens[0].revokedAt).toBeInstanceOf(Date);
    await expect(revokeToken("unknown")).resolves.toBeUndefined();
    await expect(revokeToken("")).resolves.toBeUndefined();
  });
});
