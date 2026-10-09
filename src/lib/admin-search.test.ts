import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    user: { findMany: vi.fn() },
    organization: { findMany: vi.fn() },
    supportTicket: { findMany: vi.fn() },
    invoice: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
    publishJob: { findMany: vi.fn() },
  },
}));

import { db } from "@/lib/db";
import { MAX_QUERY, normalizeQuery, PER_TYPE, scopeFor, searchAdmin } from "./admin-search";
import { ALL_PERMISSIONS, SYSTEM_ROLES } from "./admin-permissions";

const FULL = scopeFor(new Set(ALL_PERMISSIONS));
const SUPPORT = scopeFor(new Set(SYSTEM_ROLES.find((r) => r.key === "support")!.permissions));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(db.user.findMany).mockResolvedValue([{ id: "u1", email: "ana@acme.co", name: "Ana", suspendedAt: null, deletedAt: null }] as never);
  vi.mocked(db.organization.findMany).mockResolvedValue([{ id: "o1", name: "Acme", slug: "acme", deletedAt: null }] as never);
  vi.mocked(db.supportTicket.findMany).mockResolvedValue([{ id: "t1", subject: "Cannot log in", status: "open", priority: "high" }] as never);
  vi.mocked(db.post.findMany).mockResolvedValue([{ id: "p1", title: "Launch day", status: "published" }] as never);
  vi.mocked(db.publishJob.findMany).mockResolvedValue([{ id: "job12345678", status: "failed", attempts: 5 }] as never);
  vi.mocked(db.invoice.findMany).mockResolvedValue([{ id: "i1", number: "MPS-2026-0001", orgId: "o1", status: "paid", currency: "usd", amountDue: 4900 }] as never);
});

describe("normalizeQuery", () => {
  it("trims, collapses whitespace and caps length", () => {
    expect(normalizeQuery("  ana   acme ")).toBe("ana acme");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(MAX_QUERY);
  });
  it("refuses queries that are too short or not text", () => {
    for (const bad of ["", " a ", null, undefined, 42, {}]) expect(normalizeQuery(bad)).toBeNull();
  });
});

describe("searchAdmin: full administrator", () => {
  it("returns every type, each linking to its admin page", async () => {
    const r = await searchAdmin("acme", FULL);
    expect(r.map((x) => [x.type, x.href])).toEqual([
      ["user", "/admin/users/u1"],
      ["organization", "/admin/orgs/o1"],
      ["ticket", "/admin/support/t1"],
      ["invoice", "/admin/orgs/o1"],
      ["post", "/admin/posts?q=Launch%20day"],
      ["job", "/admin/queue?q=job12345678"],
    ]);
    expect(r[3].subtitle).toBe("paid · 49.00 USD");
  });

  it("caps each type and never selects secrets", async () => {
    await searchAdmin("acme", FULL);
    const userArgs = vi.mocked(db.user.findMany).mock.calls[0][0]!;
    expect(userArgs.take).toBe(PER_TYPE);
    const selected = Object.keys(userArgs.select as object);
    expect(selected).toEqual(expect.arrayContaining(["id", "email", "name"]));
    expect(selected.join(",")).not.toMatch(/passwordHash|twoFactor|token|secret/i);
  });

  it("matches case-insensitively and by exact id", async () => {
    await searchAdmin("Ana", FULL);
    const where = vi.mocked(db.user.findMany).mock.calls[0][0]!.where as { OR: Record<string, unknown>[] };
    expect(where.OR).toEqual(expect.arrayContaining([{ email: { contains: "Ana", mode: "insensitive" } }, { id: "Ana" }]));
  });

  it("labels deleted and suspended accounts", async () => {
    vi.mocked(db.user.findMany).mockResolvedValue([{ id: "u2", email: "b@x.co", name: "", suspendedAt: new Date(), deletedAt: null }] as never);
    const r = await searchAdmin("b@x", FULL);
    expect(r[0]).toMatchObject({ title: "b@x.co", subtitle: "b@x.co · suspended" });
  });

  it("does nothing for a query that is too short", async () => {
    expect(await searchAdmin("a", FULL)).toEqual([]);
    expect(db.user.findMany).not.toHaveBeenCalled();
  });
});

describe("searchAdmin: restricted support admin", () => {
  it("can find tickets and nothing else", async () => {
    const r = await searchAdmin("log in", SUPPORT);
    expect(r.map((x) => x.type)).toEqual(["ticket"]);
    expect(db.user.findMany).not.toHaveBeenCalled();
    expect(db.organization.findMany).not.toHaveBeenCalled();
    expect(db.invoice.findMany).not.toHaveBeenCalled();
  });
});

describe("scopeFor", () => {
  it("searches each type only with its own view permission", () => {
    expect(scopeFor(new Set())).toEqual({ users: false, orgs: false, tickets: false, invoices: false, posts: false, jobs: false });
    expect(scopeFor(new Set(["users.view"]))).toEqual({ users: true, orgs: false, tickets: false, invoices: false, posts: false, jobs: false });
    expect(scopeFor(new Set(["posts.view", "queue.view"]))).toMatchObject({ posts: true, jobs: true, users: false });
  });
  it("needs billing.view and orgs.view together for invoices, since an invoice opens its organization page", () => {
    expect(scopeFor(new Set(["billing.view"])).invoices).toBe(false);
    expect(scopeFor(new Set(["orgs.view"])).invoices).toBe(false);
    expect(scopeFor(new Set(["billing.view", "orgs.view"])).invoices).toBe(true);
  });
  it("gives the finance role invoices but not users", () => {
    const finance = scopeFor(new Set(SYSTEM_ROLES.find((r) => r.key === "finance")!.permissions));
    expect(finance).toMatchObject({ invoices: true, users: false, tickets: false });
  });
});
