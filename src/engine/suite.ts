import { runExperiment, type Evaluation } from "./run";
import { SCENARIOS, scenarioConfig } from "./scenarios";
import type { ResilienceMode } from "./types";

export interface SuiteRow {
  scenarioId: string;
  mode: ResilienceMode;
  seed: number;
  evaluation: Evaluation;
}

export interface SuiteOptions {
  scenarios?: string[];
  modes?: ResilienceMode[];
  seed?: number;
}

/** Runs scenarios headlessly. Used by the CLI and by tests; no UI involved. */
export function runSuite(opts: SuiteOptions = {}): SuiteRow[] {
  const ids = opts.scenarios?.length ? opts.scenarios : SCENARIOS.map((s) => s.id);
  const modes = opts.modes?.length ? opts.modes : (["resilient"] as ResilienceMode[]);
  const rows: SuiteRow[] = [];
  for (const id of ids) {
    for (const mode of modes) {
      const config = scenarioConfig(id, { mode, ...(opts.seed !== undefined ? { seed: opts.seed } : {}) });
      rows.push({ scenarioId: id, mode, seed: config.seed, evaluation: runExperiment(config) });
    }
  }
  return rows;
}

/** CI semantics: resilient runs must pass; faulty-mode runs are reference runs and never fail the suite. */
export function suiteExitCode(rows: SuiteRow[]): number {
  return rows.some((r) => r.mode === "resilient" && r.evaluation.verdict !== "passed") ? 1 : 0;
}
