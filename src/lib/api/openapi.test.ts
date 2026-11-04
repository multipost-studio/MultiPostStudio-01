import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { API_SCOPES } from "@/lib/constants";
import { buildOpenApi } from "./openapi";

const spec = buildOpenApi("https://app.example.com");
const json = JSON.stringify(spec);

describe("OpenAPI description", () => {
  it("is OpenAPI 3.1 with the server address and bearer auth", () => {
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.servers[0].url).toBe("https://app.example.com");
    expect(spec.components.securitySchemes.bearerAuth).toMatchObject({ type: "http", scheme: "bearer" });
  });

  it("only describes routes that exist", () => {
    for (const path of Object.keys(spec.paths)) {
      const dir = path.replace(/\{id\}/g, "[id]");
      expect(existsSync(join(process.cwd(), "src/app", dir, "route.ts")), path).toBe(true);
    }
  });

  it("gives every operation a unique id", () => {
    const ids = Object.values(spec.paths).flatMap((p) => Object.values(p as Record<string, { operationId: string }>).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(8); // me, channels, posts (list, create), post (get, update, delete), analytics
  });

  it("names only scopes that exist", () => {
    const named = [...json.matchAll(/Scope: ([a-z]+:[a-z]+)/g)].map((m) => m[1]);
    expect(named.length).toBeGreaterThan(0);
    for (const s of named) expect(API_SCOPES as readonly string[]).toContain(s);
  });

  it("resolves every $ref", () => {
    const refs = [...json.matchAll(/"\$ref":"#\/components\/(schemas|responses)\/(\w+)"/g)];
    expect(refs.length).toBeGreaterThan(0);
    for (const [, kind, name] of refs) {
      expect((spec.components as Record<string, Record<string, unknown>>)[kind][name], `${kind}/${name}`).toBeDefined();
    }
  });

  it("says posts are never published immediately", () => {
    expect(spec.info.description).toMatch(/does not publish immediately/);
  });
});
