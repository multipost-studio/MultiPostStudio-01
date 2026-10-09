import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isPermission, permissionForRoute } from "@/lib/admin-permissions";

/**
 * Static guard-coverage check for the admin area. The edge proxy and the admin layout keep ordinary customers out,
 * but admin access is permission-based: it is the page, action or route itself that must check the permission it
 * needs. These tests fail the moment a new admin page, action module or export route ships without that check.
 */
const ADMIN_DIR = join(process.cwd(), "src/app/admin");
const ACTIONS_DIR = join(process.cwd(), "src/app/actions");
const API_ADMIN_DIR = join(process.cwd(), "src/app/api/admin");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const norm = (p: string) => p.split("\\").join("/");
const read = (p: string) => readFileSync(p, "utf8");
const GUARD = /requireAdminPermission\(|requirePlatformAdmin\(/;

describe("admin pages", () => {
  const pages = walk(ADMIN_DIR).filter((f) => norm(f).endsWith("/page.tsx"));

  it("finds the admin pages", () => {
    expect(pages.length).toBeGreaterThan(40);
  });

  it("every page checks a permission or the super-admin guard", () => {
    const missing = pages.filter((f) => !GUARD.test(read(f)));
    expect(missing.map(norm)).toEqual([]);
  });

  it("every page asks for a real permission, and the one its route is listed under", () => {
    const bad: string[] = [];
    for (const f of pages) {
      const key = /requireAdminPermission\("([^"]+)"\)/.exec(read(f))?.[1];
      if (!key) continue;
      const route = "/admin" + (norm(f).split("/src/app/admin")[1] ?? "").replace(/\/page\.tsx$/, "");
      if (!isPermission(key)) bad.push(`${route}: unknown permission ${key}`);
      else if (permissionForRoute(route) !== key) bad.push(`${route}: page needs ${key} but the sidebar maps it to ${permissionForRoute(route)}`);
    }
    expect(bad).toEqual([]);
  });

  it("the layout admits any staff member with a permission but never customers", () => {
    expect(read(join(ADMIN_DIR, "layout.tsx"))).toContain("requireAdminAccess(");
  });
});

describe("admin server actions", () => {
  const adminModules = () => walk(ACTIONS_DIR).filter((f) => /\/admin[\w-]*\.ts$/.test(norm(f)) && !norm(f).endsWith(".test.ts"));

  it("no admin action module decides on `isPlatformAdmin` alone", () => {
    const offenders = adminModules().filter((f) => {
      const s = read(f);
      return /user\??\.isPlatformAdmin\b/.test(s) && !GUARD.test(s);
    });
    expect(offenders.map(norm)).toEqual([]);
  });

  it("every admin action module checks a permission", () => {
    const missing = adminModules().filter((f) => !GUARD.test(read(f)));
    expect(missing.map(norm)).toEqual([]);
  });

  it("the super-admin guard is used only for access, admin accounts and the guard itself", () => {
    const users = walk(join(process.cwd(), "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f))
      .filter((f) => read(f).includes("requirePlatformAdmin("))
      .map((f) => norm(f).split("/src/")[1]);
    expect(users.sort()).toEqual(["app/actions/admin-access.ts", "app/actions/admin.ts", "lib/session.ts"]);
  });

  it("support and impersonation keep their own checks", () => {
    expect(read(join(ACTIONS_DIR, "support.ts"))).toContain("support.manage");
    expect(read(join(ACTIONS_DIR, "impersonation.ts"))).toContain("platformRole");
  });
});

describe("admin data exports", () => {
  it("every /api/admin export route checks a permission", () => {
    const routes = walk(API_ADMIN_DIR).filter((f) => norm(f).endsWith("/route.ts"));
    expect(routes.length).toBeGreaterThan(1);
    const weak = routes.filter((f) => !/hasAdminPermission\(|getStaffPermissions\(/.test(read(f)));
    expect(weak.map(norm)).toEqual([]);
  });

  it("exports need data.export plus the view permission of what they export", () => {
    for (const rel of ["export/route.ts", "audience-export/route.ts", "health/export/route.ts"]) {
      const s = read(join(API_ADMIN_DIR, rel));
      expect(s, rel).toContain('"data.export"');
      expect(s, rel).toMatch(/\.view"|DATASET_VIEW_PERMISSION/);
    }
  });
});
