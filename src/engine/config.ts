import { z } from "zod";
import { pipelineSchema } from "./pipeline";
import { SERVICE_IDS, type ExperimentConfig, type FaultConfig } from "./types";

export const APP_VERSION = "0.1.1";
export const ENGINE_VERSION = "1";

export const MAX_FAULTS = 12;

export const faultSchema = z.object({
  type: z.enum(["latency", "duplicate", "outage", "packet_loss", "out_of_order"]),
  target: z.enum(SERVICE_IDS),
  startSec: z.number().min(0, "Fault start must be 0 or later."),
  durationSec: z.number().positive("Fault duration must be greater than 0.").nullable(),
  intensity: z.number().min(0).max(1),
  delaySec: z.number().min(0).max(300),
});

export const interventionSchema = z.union([
  z.object({ atSec: z.number().min(0), type: z.literal("recover"), service: z.enum(SERVICE_IDS) }),
  z.object({ atSec: z.number().min(0), type: z.literal("inject"), fault: faultSchema }),
  z.object({ atSec: z.number().min(0), type: z.literal("stop") }),
]);

export const configSchema = z.object({
  name: z.string().trim().min(1, "Give the experiment a name.").max(80, "Name must be 80 characters or fewer."),
  scenarioId: z.string().min(1).max(64),
  seed: z.number().int("Seed must be a whole number.").min(0).max(2147483647),
  eventCount: z.number().int("Event volume must be a whole number.").min(1, "Generate at least 1 reading.").max(2000, "Event volume is capped at 2000 readings."),
  intervalSec: z.number().min(0.1, "Reading interval must be at least 0.1 s.").max(60),
  durationSec: z.number().min(10, "Simulation duration must be at least 10 s.").max(3600, "Simulation duration is capped at 3600 s."),
  mode: z.enum(["resilient", "faulty"]),
  faults: z.array(faultSchema).max(MAX_FAULTS, `At most ${MAX_FAULTS} faults per experiment.`),
  drainCapacityPerSec: z.number().min(0.5).max(200),
  patientCount: z.number().int().min(1).max(12),
  staleThresholdSec: z.number().min(1).max(600),
  pipeline: pipelineSchema.optional(),
  interventions: z.array(interventionSchema).max(100),
});

export interface ConfigIssue {
  path: string;
  message: string;
}

/** Schema validation plus cross-field checks with actionable messages. */
export function validateConfig(input: unknown): { ok: true; config: ExperimentConfig } | { ok: false; issues: ConfigIssue[] } {
  const parsed = configSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    };
  }
  const c = parsed.data as ExperimentConfig;
  const issues: ConfigIssue[] = [];
  const generationEnd = c.eventCount * c.intervalSec;
  if (generationEnd > c.durationSec) {
    issues.push({
      path: "durationSec",
      message: `Generating ${c.eventCount} readings every ${c.intervalSec}s takes ${round(generationEnd)}s, longer than the ${c.durationSec}s window. Increase the duration or reduce event volume.`,
    });
  }
  c.faults.forEach((f, i) => issues.push(...validateFault(f, c, `faults.${i}`)));
  return issues.length ? { ok: false, issues } : { ok: true, config: c };
}

export function validateFault(f: FaultConfig, c: Pick<ExperimentConfig, "durationSec">, path = "fault"): ConfigIssue[] {
  const issues: ConfigIssue[] = [];
  if (f.type !== "outage" && f.target === "device") {
    issues.push({
      path: `${path}.target`,
      message: "The Device Simulator only supports outage faults. Pick Ingestion API or a downstream service for this fault type.",
    });
  }
  if (f.startSec >= c.durationSec) {
    issues.push({ path: `${path}.startSec`, message: `Fault starts at ${f.startSec}s, after the ${c.durationSec}s window ends.` });
  }
  if (f.type === "outage" && f.durationSec !== null && f.startSec + f.durationSec > c.durationSec) {
    issues.push({
      path: `${path}.durationSec`,
      message: `The outage would end at ${round(f.startSec + f.durationSec)}s, after the ${c.durationSec}s window. Recovery could not be observed; shorten the outage or extend the window.`,
    });
  }
  if (f.type === "latency" && f.delaySec <= 0) {
    issues.push({ path: `${path}.delaySec`, message: "Latency faults need a delay greater than 0 seconds." });
  }
  if (f.type === "out_of_order" && f.delaySec <= 0) {
    issues.push({ path: `${path}.delaySec`, message: "Out-of-order faults need a hold time greater than 0 seconds so newer readings can overtake held ones." });
  }
  if ((f.type === "packet_loss" || f.type === "duplicate" || f.type === "out_of_order") && f.intensity <= 0) {
    issues.push({ path: `${path}.intensity`, message: "Intensity must be greater than 0 for this fault type (otherwise nothing is affected)." });
  }
  return issues;
}

export function makeFault(partial: Partial<FaultConfig> & Pick<FaultConfig, "type" | "target">): FaultConfig {
  return { startSec: 20, durationSec: 60, intensity: 0.1, delaySec: 0, ...partial };
}

export const BASE_DEFAULTS = {
  seed: 42,
  eventCount: 200,
  intervalSec: 1,
  durationSec: 300,
  mode: "resilient" as const,
  drainCapacityPerSec: 5,
  patientCount: 4,
  staleThresholdSec: 10,
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
