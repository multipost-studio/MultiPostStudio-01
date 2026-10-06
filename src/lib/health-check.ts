/**
 * System Health Probes & Deep Readiness Diagnostics.
 *
 * Facade over src/lib/health/*: the probes, runner, config and history live
 * there. This module keeps the original import path working.
 */
export { evaluateOverallHealth, summarize } from "./health/analytics";
export { runSystemHealthProbes, PROBES, PROBE_BY_ID } from "./health/run";
export type { HealthProbeResult, SystemHealthReport, ProbeStatus, ProbeCategory } from "./health/types";
