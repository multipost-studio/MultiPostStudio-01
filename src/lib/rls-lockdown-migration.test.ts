import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "prisma", "migrations");
const sql = fs.readFileSync(path.join(dir, "20261012100000_rls_lockdown", "migration.sql"), "utf8");

// The migration cannot be run against a real Supabase project from a unit test. What can be guarded here is that it keeps
// its safety properties: it must stay a no-op where it cannot apply, and it must never lock out the app's own role.
describe("RLS lockdown migration", () => {
  it("only acts on a database that has the Supabase API roles", () => {
    expect(sql).toMatch(/to_regrole\('anon'\) IS NULL AND to_regrole\('authenticated'\) IS NULL/);
  });

  it("refuses to run as a role that does not bypass RLS, so the application cannot be locked out", () => {
    expect(sql).toMatch(/rolbypassrls OR rolsuper/);
  });

  it("enables RLS on every public table, one at a time, tolerating tables it does not own", () => {
    expect(sql).toMatch(/FROM pg_tables WHERE schemaname = 'public'/);
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/EXCEPTION WHEN insufficient_privilege/);
  });

  it("removes the API roles' grants, current and default, and never touches service_role or the owner", () => {
    expect(sql).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon/);
    expect(sql).toMatch(/REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated/);
    expect(sql).toMatch(/ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon/);
    expect(sql).not.toMatch(/service_role/);
    expect(sql).not.toMatch(/FORCE ROW LEVEL SECURITY/i);
  });

  it("creates no policies, deletes no data and drops nothing", () => {
    const code = sql.replace(/--.*$/gm, "");
    expect(code).not.toMatch(/CREATE POLICY|DROP |DELETE |TRUNCATE |ALTER TABLE [^;]*(DROP|RENAME)/i);
  });
});
