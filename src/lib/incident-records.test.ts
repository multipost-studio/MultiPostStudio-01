import { describe, expect, it } from "vitest";
import { INCIDENT_STATUSES, incidentStatusLabel, isIncidentKey, isIncidentStatus } from "./incident-records";
import { deriveIncidents } from "./health/analytics";

describe("isIncidentKey", () => {
  it("accepts the id deriveIncidents produces", () => {
    const rows = [
      { id: "1", probeId: "database", name: "Database", category: "core", status: "unhealthy", message: "down", latencyMs: 1, trigger: "scheduled", createdAt: "2026-10-09T10:00:00.000Z" },
      { id: "2", probeId: "database", name: "Database", category: "core", status: "healthy", message: "ok", latencyMs: 1, trigger: "scheduled", createdAt: "2026-10-09T10:05:00.000Z" },
    ];
    const [incident] = deriveIncidents(rows as never, Date.parse("2026-10-09T11:00:00Z"));
    expect(incident).toBeDefined();
    expect(isIncidentKey(incident.id)).toBe(true);
  });
  it("rejects anything else", () => {
    for (const bad of ["", "database", "database@yesterday", "@2026-10-09T10:00:00.000Z", "a b@2026-10-09T10:00:00.000Z", "x@2026-13-45T10:00:00.000Z", 42, null, undefined, "x".repeat(200) + "@2026-10-09T10:00:00.000Z"]) {
      expect(isIncidentKey(bad)).toBe(false);
    }
  });
});

describe("statuses", () => {
  it("knows its own ids and labels", () => {
    expect(INCIDENT_STATUSES.map((s) => s.id)).toEqual(["open", "investigating", "monitoring", "resolved"]);
    expect(isIncidentStatus("monitoring")).toBe(true);
    expect(isIncidentStatus("closed")).toBe(false);
    expect(incidentStatusLabel("resolved")).toBe("Follow-up done");
    expect(incidentStatusLabel("whatever")).toBe("whatever");
  });
});
