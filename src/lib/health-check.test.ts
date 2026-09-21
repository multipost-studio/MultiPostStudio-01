import { describe, it, expect } from "vitest";
import { evaluateOverallHealth, type HealthProbeResult } from "./health-check";

describe("System Health Diagnostics", () => {
  it("determines overall health based on probe states", () => {
    const allHealthy: HealthProbeResult[] = [
      { name: "DB", category: "core", status: "healthy", message: "ok" },
      { name: "Queue", category: "core", status: "healthy", message: "ok" },
    ];
    expect(evaluateOverallHealth(allHealthy)).toBe("healthy");

    const degraded: HealthProbeResult[] = [
      { name: "DB", category: "core", status: "healthy", message: "ok" },
      { name: "AI", category: "integration", status: "degraded", message: "stub" },
    ];
    expect(evaluateOverallHealth(degraded)).toBe("degraded");

    const unhealthy: HealthProbeResult[] = [
      { name: "DB", category: "core", status: "unhealthy", message: "down" },
      { name: "AI", category: "integration", status: "healthy", message: "ok" },
    ];
    expect(evaluateOverallHealth(unhealthy)).toBe("unhealthy");
  });
});
