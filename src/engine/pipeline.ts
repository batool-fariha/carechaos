import { z } from "zod";
import type { AlertRuleConfig, ExperimentConfig, Measurement, PipelineConfig, ServiceId } from "./types";
import { SERVICE_IDS } from "./types";

/** Illustrative alert rules for fictional demo data. NOT medically validated thresholds. */
export const ALERT_RULES: Record<Measurement, { label: string; breaches: (v: number) => boolean }> = {
  heart_rate: { label: "heart_rate > 120 bpm", breaches: (v) => v > 120 },
  oxygen_saturation: { label: "oxygen_saturation < 90 %", breaches: (v) => v < 90 },
  systolic_bp: { label: "systolic_bp > 160 mmHg", breaches: (v) => v > 160 },
};

export const BASE_CAPACITY_PER_SEC: Record<ServiceId, number> = {
  device: 100,
  ingestion: 40,
  processor: 20,
  rules: 20,
  delivery: 10,
  dashboard: Infinity,
};

export const DEFAULT_PIPELINE = {
  queueCapacity: 1000,
  retry: { maxRetries: 8, baseSec: 1, capSec: 8 },
  recoveryWarmupSec: 2,
  degradedQueueDepth: 25,
} as const;

const UNITS: Record<Measurement, string> = { heart_rate: "bpm", oxygen_saturation: "%", systolic_bp: "mmHg" };

const ruleSchema = z.object({ op: z.enum([">", "<"]), threshold: z.number().finite() });
const capacity = z.number().min(0.1, "Capacity must be at least 0.1 events/s.").max(100000);

export const pipelineSchema = z
  .object({
    capacities: z.object({ device: capacity, ingestion: capacity, processor: capacity, rules: capacity, delivery: capacity, dashboard: capacity }).partial().strict(),
    queueCapacity: z.number().int().min(1, "Queue capacity must be at least 1.").max(100000),
    retry: z.object({ maxRetries: z.number().int().min(0).max(50), baseSec: z.number().min(0.1).max(60), capSec: z.number().min(0.1).max(600) }),
    deadLetterRedrive: z.boolean(),
    recoveryWarmupSec: z.number().min(0).max(120),
    degradedQueueDepth: z.number().int().min(1).max(100000),
    alertRules: z.object({ heart_rate: ruleSchema, oxygen_saturation: ruleSchema, systolic_bp: ruleSchema }).partial().strict(),
  })
  .partial()
  .strict();

export interface ResolvedPipeline {
  capacity: Record<ServiceId, number>;
  queueCapacity: number;
  maxRetries: number;
  retryBaseMs: number;
  retryCapMs: number;
  redrive: boolean;
  warmupMs: number;
  degradedDepth: number;
  rules: Record<Measurement, { label: string; breaches: (v: number) => boolean }>;
}

function ruleFrom(m: Measurement, r: AlertRuleConfig) {
  return { label: `${m} ${r.op} ${r.threshold} ${UNITS[m]}`, breaches: (v: number) => (r.op === ">" ? v > r.threshold : v < r.threshold) };
}

/** Merges a config's pipeline overrides onto the defaults. */
export function resolvePipeline(config: Pick<ExperimentConfig, "pipeline">): ResolvedPipeline {
  const p: PipelineConfig = config.pipeline ?? {};
  const capacity = { ...BASE_CAPACITY_PER_SEC } as Record<ServiceId, number>;
  for (const id of SERVICE_IDS) if (p.capacities?.[id] !== undefined) capacity[id] = p.capacities[id] as number;
  const retry = p.retry ?? DEFAULT_PIPELINE.retry;
  const rules = { ...ALERT_RULES };
  for (const m of Object.keys(p.alertRules ?? {}) as Measurement[]) {
    const r = p.alertRules?.[m];
    if (r) rules[m] = ruleFrom(m, r);
  }
  return {
    capacity,
    queueCapacity: p.queueCapacity ?? DEFAULT_PIPELINE.queueCapacity,
    maxRetries: retry.maxRetries,
    retryBaseMs: Math.round(retry.baseSec * 1000),
    retryCapMs: Math.round(Math.max(retry.capSec, retry.baseSec) * 1000),
    redrive: p.deadLetterRedrive ?? true,
    warmupMs: Math.round((p.recoveryWarmupSec ?? DEFAULT_PIPELINE.recoveryWarmupSec) * 1000),
    degradedDepth: p.degradedQueueDepth ?? DEFAULT_PIPELINE.degradedQueueDepth,
    rules,
  };
}
