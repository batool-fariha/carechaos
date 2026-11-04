import { assertionPassRate, evaluateAssertions, type AssertionOutcome, type AssertionSpec } from "./assertions";
import { computeMetrics, type Metrics } from "./metrics";
import { assertionsFor } from "./scenarios";
import { Simulation } from "./simulation";
import type { ExperimentConfig, SimulationResult } from "./types";

export type Verdict = "passed" | "failed" | "inconclusive";

export interface Evaluation {
  result: SimulationResult;
  metrics: Metrics;
  assertions: AssertionOutcome[];
  /** passed/failed only for completed runs; a stopped run is inconclusive and reports no assertions. */
  verdict: Verdict;
}

export function evaluate(result: SimulationResult, specs?: AssertionSpec[]): Evaluation {
  const metrics = computeMetrics(result);
  if (result.status !== "completed") {
    return { result, metrics, assertions: [], verdict: "inconclusive" };
  }
  const assertions = evaluateAssertions(result, metrics, specs ?? assertionsFor(result.config));
  metrics.assertionPassRate = assertionPassRate(assertions);
  const failed = assertions.some((a) => a.status === "failed");
  return { result, metrics, assertions, verdict: failed ? "failed" : "passed" };
}

/** Run a configuration to completion (honoring recorded interventions) and evaluate it. */
export function runExperiment(config: ExperimentConfig, specs?: AssertionSpec[]): Evaluation {
  const sim = new Simulation(config);
  sim.start();
  sim.advanceTo(config.durationSec);
  return evaluate(sim.getResult(), specs);
}

export interface Comparison {
  baseline: Evaluation;
  faulted: Evaluation;
  alternate: Evaluation;
}

/** Healthy reference (same seed/mode, no faults) and the opposite resilience mode on the same configuration. */
export function runComparison(config: ExperimentConfig): Comparison {
  const faulted = runExperiment(config);
  const baseline = runExperiment({ ...config, faults: [], interventions: [], name: `${config.name} (baseline)` });
  const alternate = runExperiment({ ...config, mode: config.mode === "resilient" ? "faulty" : "resilient" });
  return { baseline, faulted, alternate };
}
