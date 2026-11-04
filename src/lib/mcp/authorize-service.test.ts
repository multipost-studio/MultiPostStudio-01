import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({ created: [] as Record<string, unknown>[], client: null as Record<string, unknown> | null }));

vi.mock("@/lib/env", () => ({ appUrl: (p = "") => `https://app.example.com${p}` }));
vi.mock("@/lib/db", () => ({
  db: {
    oAuthClient: { findUnique: vi.fn(async () => m.client) },
    oAuthAuthRequest: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        m.created.push(data);
        return { id: data.id };
      }),
    },
  },
}));

import { startAuthorization } from "./authorize-service";

const challenge = createHash("sha256").update("v".repeat(50)).digest("base64url");
const query = (over: Record<string, string> = {}) =>
  new URLSearchParams({ client_id: "mpc_a", redirect_uri: "https://claude.ai/cb", response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", ...over });

beforeEach(() => {
  m.created = [];
  m.client = { id: "mpc_a", name: "Claude", redirectUris: JSON.stringify(["https://claude.ai/cb"]) };
});

describe("starting an authorization", () => {
  it("records the request and sends the browser to the consent screen with only its id", async () => {
    const out = await startAuthorization(query({ scope: "posts:read bogus" }));
    expect(out.kind).toBe("redirect");
    const id = String(m.created[0].id);
    expect(id).toMatch(/^mpq_/);
    expect(out).toEqual({ kind: "redirect", location: `https://app.example.com/connect/authorize?request=${encodeURIComponent(id)}` });
    expect(m.created[0]).toMatchObject({ clientId: "mpc_a", redirectUri: "https://claude.ai/cb", codeChallenge: challenge, state: "xyz", scopes: JSON.stringify(["posts:read"]) });
  });

  it("never redirects for an unknown app or an unregistered return address", async () => {
    m.client = null;
    expect((await startAuthorization(query())).kind).toBe("page-error");
    m.client = { id: "mpc_a", name: "Claude", redirectUris: JSON.stringify(["https://claude.ai/cb"]) };
    expect((await startAuthorization(query({ redirect_uri: "https://evil.example/cb" }))).kind).toBe("page-error");
    expect((await startAuthorization(query({ redirect_uri: "" }))).kind).toBe("page-error");
    expect((await startAuthorization(new URLSearchParams())).kind).toBe("page-error");
    expect(m.created).toHaveLength(0);
  });

  it("answers other mistakes by redirecting back to the app with an error", async () => {
    const noPkce = await startAuthorization(query({ code_challenge: "" }));
    expect(noPkce).toMatchObject({ kind: "redirect" });
    expect((noPkce as { location: string }).location).toContain("error=invalid_request");
    expect((noPkce as { location: string }).location).toContain("state=xyz");

    const plain = await startAuthorization(query({ code_challenge_method: "plain" }));
    expect((plain as { location: string }).location).toContain("error=invalid_request");

    const type = await startAuthorization(query({ response_type: "token" }));
    expect((type as { location: string }).location).toContain("error=unsupported_response_type");

    const resource = await startAuthorization(query({ resource: "https://other.example/mcp" }));
    expect((resource as { location: string }).location).toContain("error=invalid_target");
    expect(m.created).toHaveLength(0);
  });

  it("accepts this server's own address as the resource, with or without a trailing slash", async () => {
    expect((await startAuthorization(query({ resource: "https://app.example.com/api/mcp" }))).kind).toBe("redirect");
    expect((await startAuthorization(query({ resource: "https://app.example.com/api/mcp/" }))).kind).toBe("redirect");
    expect(m.created).toHaveLength(2);
  });
});
