import { describe, it, expect } from "vitest";
import { computeObservabilityMetrics, isBenignRequestError, persistsRequestErrors } from "./observe";

describe("Observability Telemetry Module", () => {
  it("computes accurate error counts, velocity, and source breakdown", () => {
    const now = new Date();
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const mockEvents = [
      { level: "error", source: "webhook", createdAt: thirtyMinAgo },
      { level: "error", source: "webhook", createdAt: twoHoursAgo },
      { level: "warn", source: "ai", createdAt: thirtyMinAgo },
      { level: "info", source: "auth", createdAt: thirtyMinAgo },
      { level: "info", source: "billing", createdAt: thirtyMinAgo },
    ];

    const metrics = computeObservabilityMetrics(mockEvents);

    expect(metrics.totalEvents).toBe(5);
    expect(metrics.errorCount).toBe(2);
    expect(metrics.warnCount).toBe(1);
    expect(metrics.infoCount).toBe(2);
    expect(metrics.errorVelocityPerHour).toBe(1); // only the error within the last 60 minutes
    expect(metrics.bySource.webhook).toBe(2);
    expect(metrics.bySource.ai).toBe(1);
    expect(metrics.bySource.auth).toBe(1);
  });

  it("handles empty event stream gracefully", () => {
    const metrics = computeObservabilityMetrics([]);
    expect(metrics.totalEvents).toBe(0);
    expect(metrics.errorCount).toBe(0);
    expect(metrics.errorVelocityPerHour).toBe(0);
    expect(Object.keys(metrics.bySource)).toHaveLength(0);
  });
});

describe("request error filtering", () => {
  it("treats client disconnects as benign and real faults as not", () => {
    for (const m of ["The destination stream closed early.", "The operation was aborted", "aborted", "read ECONNRESET", "Request aborted"]) {
      expect(isBenignRequestError(m), m).toBe(true);
    }
    for (const m of ["useSidebar must be used within a SidebarProvider.", "window is not defined", "Invalid `db.user.findMany()` invocation", "", null, undefined]) {
      expect(isBenignRequestError(m as never), String(m)).toBe(false);
    }
  });

  it("persists request errors only in production", () => {
    expect(persistsRequestErrors("production")).toBe(true);
    expect(persistsRequestErrors("development")).toBe(false);
    expect(persistsRequestErrors("test")).toBe(false);
    expect(persistsRequestErrors(undefined)).toBe(false);
  });
});
