import { makeFault, scenarioConfig, Simulation, type ExperimentConfig, type FaultConfig } from "@/engine";

export function cfg(over: Partial<ExperimentConfig> = {}, faults: FaultConfig[] = []): ExperimentConfig {
  return {
    ...scenarioConfig("healthy-baseline"),
    eventCount: 120,
    durationSec: 200,
    ...over,
    faults,
    interventions: over.interventions ?? [],
  };
}
export { makeFault };
export function run(config: ExperimentConfig) {
  const sim = new Simulation(config);
  sim.start();
  sim.advanceTo(config.durationSec);
  return sim.getResult();
}
