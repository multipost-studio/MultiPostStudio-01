import { describe, it, expect } from "vitest";
import { adminQueryString, dateRange, parseAdminQuery } from "./admin-query";

describe("parseAdminQuery", () => {
  const opts = { defaultSort: "createdAt", sortable: ["createdAt", "name"], filterKeys: ["status", "from", "to"] };

  it("applies defaults and ignores unknown sort fields", () => {
    const q = parseAdminQuery({ sort: "passwordHash", perPage: "7" }, opts);
    expect(q).toMatchObject({ sort: "createdAt", dir: "desc", perPage: 50, page: 1, skip: 0 });
  });

  it("keeps only declared filter keys and computes the offset", () => {
    const q = parseAdminQuery({ status: "failed", evil: "1", page: "3", perPage: "25", q: "  hi " }, opts);
    expect(q.filters).toEqual({ status: "failed" });
    expect(q).toMatchObject({ q: "hi", page: 3, perPage: 25, skip: 50 });
  });

  it("round-trips through adminQueryString", () => {
    const q = parseAdminQuery({ status: "x", sort: "name", dir: "asc" }, opts);
    expect(adminQueryString(q, { page: 2 })).toBe("?sort=name&dir=asc&status=x&page=2");
  });
});

describe("dateRange", () => {
  it("is undefined without usable dates", () => {
    expect(dateRange({})).toBeUndefined();
    expect(dateRange({ from: "yesterday", to: "2026-13-45" })).toBeUndefined();
    expect(dateRange({ from: "2026-02-31" })).toBeUndefined();
  });

  it("covers whole UTC days inclusively", () => {
    const r = dateRange({ from: "2026-10-01", to: "2026-10-03" })!;
    expect(r.gte?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.lte?.toISOString()).toBe("2026-10-03T23:59:59.999Z");
  });

  it("supports open-ended ranges", () => {
    expect(dateRange({ from: "2026-10-01" })).toEqual({ gte: new Date("2026-10-01T00:00:00.000Z") });
    expect(dateRange({ to: "2026-10-01" })).toEqual({ lte: new Date("2026-10-01T23:59:59.999Z") });
  });

  it("swaps a reversed range", () => {
    const r = dateRange({ from: "2026-10-05", to: "2026-10-02" })!;
    expect(r.gte?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(r.lte?.toISOString()).toBe("2026-10-05T23:59:59.999Z");
  });
});
