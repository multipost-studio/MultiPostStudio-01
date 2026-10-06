import { describe, it, expect } from "vitest";
import { parseFlagImport, planFlagImport } from "./flags-import";

const ok = (text: string) => {
  const r = parseFlagImport(text);
  if (!r.ok) throw new Error(r.errors.join("; "));
  return r.flags;
};
const errs = (text: string) => {
  const r = parseFlagImport(text);
  if (r.ok) throw new Error("expected errors");
  return r.errors.join(" | ");
};

describe("parseFlagImport JSON", () => {
  it("accepts the export envelope, a bare array and yes/no values", () => {
    const rows = [{ key: "trends_v2", description: "Trend Explorer", enabled: "yes", rollout_pct: 15 }];
    expect(ok(JSON.stringify({ rows }))).toEqual([{ key: "trends_v2", description: "Trend Explorer", enabled: true, rollout: 15 }]);
    expect(ok(JSON.stringify([{ key: "x", enabled: false, rollout: 0 }]))).toEqual([{ key: "x", description: null, enabled: false, rollout: 0 }]);
  });

  it("leaves unspecified fields null so existing values are kept", () => {
    expect(ok('[{"key":"only_key"}]')).toEqual([{ key: "only_key", description: null, enabled: null, rollout: null }]);
  });

  it("rejects bad keys, duplicates, bad booleans and out-of-range rollout, naming the row", () => {
    const msg = errs(JSON.stringify([{ key: "Bad Key" }, { key: "a" }, { key: "a" }, { key: "b", enabled: "maybe" }, { key: "c", rollout: 101 }, { key: "d", rollout: 1.5 }]));
    expect(msg).toContain("Row 1");
    expect(msg).toContain("Row 3");
    expect(msg).toContain("appears more than once");
    expect(msg).toContain("Row 4 (b): enabled");
    expect(msg).toContain("Row 5 (c): rollout");
    expect(msg).toContain("Row 6 (d): rollout");
  });

  it("rejects malformed JSON, wrong shapes, empties and oversize lists", () => {
    expect(errs("{oops")).toContain("not valid JSON");
    expect(errs('{"a":1}')).toContain("array");
    expect(errs("[1,2]")).toContain("object");
    expect(errs("[]")).toContain("no flags");
    expect(errs("   ")).toContain("empty");
    expect(errs(JSON.stringify(Array.from({ length: 501 }, (_, i) => ({ key: `k${i}` }))))).toContain("Too many");
  });

  it("limits description length", () => {
    expect(errs(JSON.stringify([{ key: "x", description: "a".repeat(201) }]))).toContain("description");
  });
});

describe("parseFlagImport CSV", () => {
  it("parses the CSV the export produces", () => {
    const csv = "key,description,enabled,rollout_pct,updated_at\r\nai_agent,\"Agent, autonomous\",yes,100,2026-10-01T00:00:00Z\r\ntrends_v2,Trends,no,15,2026-10-01T00:00:00Z";
    expect(ok(csv)).toEqual([
      { key: "ai_agent", description: "Agent, autonomous", enabled: true, rollout: 100 },
      { key: "trends_v2", description: "Trends", enabled: false, rollout: 15 },
    ]);
  });

  it("requires a key column and at least one row", () => {
    expect(errs("name,enabled\nx,yes")).toContain('"key" column');
    expect(errs("key,enabled")).toContain("at least one flag");
  });
});

describe("planFlagImport", () => {
  const existing = [
    { key: "a", description: "A", enabled: true, rollout: 100 },
    { key: "b", description: "B", enabled: false, rollout: 10 },
  ];

  it("classifies creates, updates and unchanged, describing each change", () => {
    const { changes, unchanged } = planFlagImport(
      [
        { key: "a", description: "A", enabled: true, rollout: 100 },
        { key: "b", description: "B2", enabled: true, rollout: 50 },
        { key: "c", description: null, enabled: null, rollout: null },
      ],
      existing,
    );
    expect(unchanged).toBe(1);
    expect(changes).toEqual([
      { key: "b", kind: "update", details: ["enabled false → true", "rollout 10% → 50%", "description changed"] },
      { key: "c", kind: "create", details: ["enabled false", "rollout 0%"] },
    ]);
  });

  it("treats null fields as keep-existing", () => {
    expect(planFlagImport([{ key: "b", description: null, enabled: null, rollout: null }], existing)).toEqual({ changes: [], unchanged: 1 });
  });
});
