import { describe, it, expect } from "vitest";
import { parseAdminQuery } from "@/lib/admin-query";
import { DATASETS } from ".";
import { affiliatesQueryOpts, affiliatesWhere, orgsQueryOpts, orgsWhere, usersQueryOpts, usersWhere } from "./accounts";
import { auditQueryOpts, auditWhere, broadcastsQueryOpts, broadcastsWhere, eventsQueryOpts, eventsWhere, jobsQueryOpts, jobsWhere, postsQueryOpts, postsWhere, privacyQueryOpts, privacyWhere, supportQueryOpts, supportWhere } from "./activity";
import { invoicesQueryOpts, invoicesWhere, plansQueryOpts, plansWhere, subscriptionsQueryOpts, subscriptionsWhere, usageQueryOpts, usageWhere } from "./commerce";
import { aiQueryOpts, aiWhere, connectionsQueryOpts, connectionsWhere, flagsQueryOpts, flagsWhere, securityQueryOpts, securityWhere } from "./platform";

const q = (opts: Parameters<typeof parseAdminQuery>[1], raw: Record<string, string>) => parseAdminQuery(raw, opts);
const D = (iso: string) => new Date(iso);

describe("registry", () => {
  it("has one dataset per type and every default sort is allowed", () => {
    const types = Object.values(DATASETS).map((d) => d.type);
    expect(new Set(types).size).toBe(types.length);
    for (const d of Object.values(DATASETS)) {
      expect(d.queryOpts.sortable).toContain(d.queryOpts.defaultSort);
    }
  });

  it("covers every module that offers an export link", () => {
    for (const t of ["users", "orgs", "affiliates", "audit", "posts", "jobs", "events", "privacy", "support", "invoices", "subscriptions", "plans", "usage", "ai", "connections", "flags", "cms", "security", "broadcasts"]) {
      expect(DATASETS[t], t).toBeDefined();
    }
  });
});

describe("filters shared by page and export", () => {
  it("users: search, status, verification, admin flag and signup range", () => {
    const w = usersWhere(q(usersQueryOpts, { q: "ann", status: "suspended", verified: "no", admin: "yes", from: "2026-10-01", to: "2026-10-02" }));
    expect(w).toMatchObject({ suspendedAt: { not: null }, emailVerified: null, isPlatformAdmin: true, createdAt: { gte: D("2026-10-01T00:00:00Z"), lte: D("2026-10-02T23:59:59.999Z") } });
    expect(w.OR).toHaveLength(2);
    expect(usersWhere(q(usersQueryOpts, {}))).toEqual({});
  });

  it("orgs: plan, type and deleted filters apply (the export used to ignore them)", () => {
    expect(orgsWhere(q(orgsQueryOpts, { plan: "pro", type: "agency", deleted: "no" }))).toEqual({ type: "agency", deletedAt: null, subscription: { plan: { key: "pro" } } });
    expect(orgsWhere(q(orgsQueryOpts, { deleted: "yes" }))).toEqual({ deletedAt: { not: null } });
  });

  it("affiliates: statuses, search and range", () => {
    const w = affiliatesWhere(q(affiliatesQueryOpts, { applicationStatus: "approved", status: "active", q: "x", from: "2026-10-01" }));
    expect(w).toMatchObject({ applicationStatus: "approved", status: "active", createdAt: { gte: D("2026-10-01T00:00:00Z") } });
    expect(w.OR).toHaveLength(3);
  });

  it("audit: scope prefix, case-insensitive search across action/target/actor, and range combine with AND", () => {
    const w = auditWhere(q(auditQueryOpts, { q: "Login", scope: "auth", to: "2026-10-03" }));
    const and = (w as { AND: unknown[] }).AND;
    expect(and).toHaveLength(3);
    expect(and).toContainEqual({ action: { startsWith: "auth." } });
    expect(and).toContainEqual({ createdAt: { lte: D("2026-10-03T23:59:59.999Z") } });
    expect(auditWhere(q(auditQueryOpts, { scope: "nonsense" }))).toEqual({});
  });

  it("posts and jobs: status/platform, range column", () => {
    expect(postsWhere(q(postsQueryOpts, { status: "failed", platform: "x", from: "2026-10-01" }))).toMatchObject({ status: "failed", channels: { some: { platform: "x" } }, createdAt: { gte: D("2026-10-01T00:00:00Z") } });
    const j = jobsWhere(q(jobsQueryOpts, { status: "failed", from: "2026-10-01" }));
    expect(j).toMatchObject({ status: "failed", runAt: { gte: D("2026-10-01T00:00:00Z") } });
  });

  it("events: level, source, search and range", () => {
    const w = eventsWhere(q(eventsQueryOpts, { level: "error", source: "queue", q: "timeout", from: "2026-10-01" }));
    expect(w).toMatchObject({ level: "error", source: "queue", createdAt: { gte: D("2026-10-01T00:00:00Z") } });
    expect(w.OR).toHaveLength(2);
  });

  it("privacy requests now support search", () => {
    const w = privacyWhere(q(privacyQueryOpts, { q: "asha", status: "submitted", type: "erasure" }));
    expect(w).toMatchObject({ status: "submitted", type: "erasure" });
    expect(w.OR).toHaveLength(3);
  });

  it("support: defaults to the waiting-on-us queue and honours every filter", () => {
    expect(supportWhere(q(supportQueryOpts, {}))).toEqual({ status: { in: ["open", "pending"] } });
    expect(supportWhere(q(supportQueryOpts, { status: "all" }))).toEqual({});
    expect(supportWhere(q(supportQueryOpts, { status: "resolved", kind: "feedback", priority: "urgent", assignee: "unassigned" }))).toEqual({ status: "resolved", kind: "feedback", priority: "urgent", assignedToId: null });
    expect(supportWhere(q(supportQueryOpts, { status: "all", assignee: "u_1", from: "2026-10-01" }))).toMatchObject({ assignedToId: "u_1", createdAt: { gte: D("2026-10-01T00:00:00Z") } });
  });

  it("invoices: status, case-insensitive currency, search and range", () => {
    const w = invoicesWhere(q(invoicesQueryOpts, { status: "paid", currency: "INR", q: "inv-1", from: "2026-10-01" }));
    expect(w).toMatchObject({ status: "paid", currency: { equals: "INR", mode: "insensitive" }, createdAt: { gte: D("2026-10-01T00:00:00Z") } });
    expect(w.OR).toHaveLength(2);
  });

  it("subscriptions and plans", () => {
    expect(subscriptionsWhere(q(subscriptionsQueryOpts, { status: "past_due", provider: "razorpay", interval: "year" }))).toMatchObject({ status: "past_due", provider: "razorpay", interval: "year" });
    expect(plansWhere(q(plansQueryOpts, { visibility: "hidden" }))).toEqual({ isPublic: false });
    expect(plansWhere(q(plansQueryOpts, { visibility: "public", q: "pro" }))).toMatchObject({ isPublic: true });
  });

  it("usage: only accepts a valid YYYY-MM, otherwise the current month", () => {
    expect(usageWhere(q(usageQueryOpts, { month: "2026-09", metric: "api_calls" }))).toMatchObject({ periodMonth: "2026-09", metric: "api_calls" });
    const now = new Date().toISOString().slice(0, 7);
    expect(usageWhere(q(usageQueryOpts, { month: "2026-13" })).periodMonth).toBe(now);
    expect(usageWhere(q(usageQueryOpts, { month: "'; drop table" })).periodMonth).toBe(now);
  });

  it("ai, connections and flags", () => {
    expect(aiWhere(q(aiQueryOpts, { status: "invalid", provider: "openai", from: "2026-10-01" }))).toMatchObject({ status: "invalid", provider: "openai", createdAt: { gte: D("2026-10-01T00:00:00Z") } });
    expect(connectionsWhere(q(connectionsQueryOpts, { status: "expired", platform: "x", to: "2026-10-05" }))).toMatchObject({ status: "expired", platform: "x", connectedAt: { lte: D("2026-10-05T23:59:59.999Z") } });
    expect(flagsWhere(q(flagsQueryOpts, { state: "on" }))).toEqual({ enabled: true });
    expect(flagsWhere(q(flagsQueryOpts, { state: "off", q: "beta" }))).toMatchObject({ enabled: false });
  });

  it("security: lockouts, admins, or both, excluding deleted users", () => {
    const now = new Date("2026-10-06T00:00:00Z");
    expect(securityWhere(q(securityQueryOpts, { kind: "admins" }), now)).toEqual({ deletedAt: null, isPlatformAdmin: true });
    expect(securityWhere(q(securityQueryOpts, { kind: "lockouts" }), now)).toMatchObject({ deletedAt: null, OR: [{ twoFactorLockedUntil: { gt: now } }, { twoFactorFailedAttempts: { gt: 0 } }] });
    expect((securityWhere(q(securityQueryOpts, {}), now) as { OR: unknown[] }).OR).toHaveLength(2);
  });

  it("broadcasts are system notifications only", () => {
    expect(broadcastsWhere(q(broadcastsQueryOpts, {}))).toEqual({ type: "system" });
  });

  it("cannot be steered by unknown filter keys or sort fields", () => {
    const query = q(usersQueryOpts, { sort: "passwordHash", twoFactorSecret: "x", status: "active" });
    expect(query.sort).toBe("createdAt");
    expect(Object.keys(query.filters)).toEqual(["status"]);
  });
});
