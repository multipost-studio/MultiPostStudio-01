import { describe, it, expect } from "vitest";
import { cleanEventTitle, groupAuditActions, groupSystemEvents } from "./activity-feed";

const at = (min: number) => new Date(Date.UTC(2026, 9, 5, 12, 0) - min * 60_000);

describe("cleanEventTitle", () => {
  it("drops query strings, tracing tokens and the JSON metadata blob", () => {
    expect(
      cleanEventTitle('GET /dashboard?range=90&_rsc=C0TzFx1RMv0tf6y_ failed: The destination stream closed early. {"route":"/dashboard","routeType":"render","digest":"1511738012"}'),
    ).toBe("GET /dashboard failed: The destination stream closed early.");
  });

  it("keeps only the first line of multi-line errors and shortens file paths", () => {
    const msg = "GET /dashboard failed: \nInvalid `db.activityEvent.findMany()` invocation in\nC:\\Users\\new\\Documents\\Omer_DLS_Files\\p\\commit\\cadence\\.next\\dev\\server\\chunks\\ssr\\x.js:285:142";
    expect(cleanEventTitle(msg)).toBe("GET /dashboard failed:");
    expect(cleanEventTitle("failed in C:\\Users\\new\\Documents\\Omer_DLS_Files\\p\\commit\\cadence\\src\\lib\\db.ts now")).toBe("failed in … now");
    expect(cleanEventTitle("crash at /var/task/.next/server/chunks/ssr/page.js")).toBe("crash at …");
  });

  it("caps very long titles and tolerates empty input", () => {
    expect(cleanEventTitle("x".repeat(500)).length).toBe(160);
    expect(cleanEventTitle("")).toBe("");
    expect(cleanEventTitle(null)).toBe("");
  });

  it("leaves short, plain messages alone", () => {
    expect(cleanEventTitle("Stripe webhook retry scheduled")).toBe("Stripe webhook retry scheduled");
  });
});

describe("groupSystemEvents", () => {
  const ev = (id: string, message: string, min: number, level = "error", source = "system") => ({ id, level, source, message, createdAt: at(min) });

  it("collapses the same failure across different URLs into one row with a count", () => {
    const rows = groupSystemEvents(
      [
        ev("1", 'GET /dashboard?range=7&_rsc=a failed: The destination stream closed early. {"x":1}', 5),
        ev("2", 'GET /dashboard?range=30&_rsc=b failed: The destination stream closed early. {"x":2}', 4),
        ev("3", "GET /dashboard failed: window is not defined", 3),
      ],
      5,
    );
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.title.includes("stream closed"))!.count).toBe(2);
    expect(rows[0].title).toContain("window is not defined"); // most recent first
  });

  it("does not merge different levels or sources, and respects the limit", () => {
    const rows = groupSystemEvents([ev("1", "same", 3, "error"), ev("2", "same", 2, "warn"), ev("3", "same", 1, "error", "api")], 2);
    expect(rows).toHaveLength(2);
  });

  it("reports the latest timestamp for a group", () => {
    const rows = groupSystemEvents([ev("1", "boom", 30), ev("2", "boom", 2)], 5);
    expect(rows[0].at).toBe(at(2).toISOString());
  });
});

describe("groupAuditActions", () => {
  it("turns repeated toggling by one admin into a single counted row", () => {
    const rows = groupAuditActions(
      [
        { id: "1", action: "promo_card.disable", actor: "Omer", createdAt: at(1) },
        { id: "2", action: "promo_card.disable", actor: "Omer", createdAt: at(2) },
        { id: "3", action: "promo_card.enable", actor: "Omer", createdAt: at(3) },
        { id: "4", action: "promo_card.enable", actor: "Dana", createdAt: at(4) },
      ],
      10,
    );
    expect(rows.map((r) => `${r.actor}:${r.action}:${r.count}`)).toEqual(["Omer:promo_card.disable:2", "Omer:promo_card.enable:1", "Dana:promo_card.enable:1"]);
  });
});
