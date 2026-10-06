import { describe, it, expect } from "vitest";
import { evaluateOverallHealth, PROBES, type HealthProbeResult } from "./health-check";
import { PROBE_IDS } from "./health/config";

const probe = (status: HealthProbeResult["status"], extra: Partial<HealthProbeResult> = {}): HealthProbeResult => ({
  id: "database",
  name: "p",
  category: "core",
  status,
  description: "d",
  message: "m",
  checkedAt: "2026-10-06T00:00:00Z",
  ...extra,
});

describe("System Health Diagnostics", () => {
  it("determines overall health based on probe states", () => {
    expect(evaluateOverallHealth([probe("healthy"), probe("healthy")])).toBe("healthy");
    expect(evaluateOverallHealth([probe("healthy"), probe("degraded")])).toBe("degraded");
    expect(evaluateOverallHealth([probe("unhealthy"), probe("healthy")])).toBe("unhealthy");
  });

  it("does not let an unconfigured optional service or a muted probe drag the status down", () => {
    expect(evaluateOverallHealth([probe("healthy"), probe("skipped")])).toBe("healthy");
    expect(evaluateOverallHealth([probe("healthy"), probe("unhealthy", { muted: true })])).toBe("healthy");
  });

  it("registers every configurable probe id exactly once, in order", () => {
    expect(PROBES.map((p) => p.id)).toEqual([...PROBE_IDS]);
  });
});
