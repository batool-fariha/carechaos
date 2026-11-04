/**
 * Experiment files: a small JSON format for describing your own pipeline, faults and assertions.
 * Used by the `carechaos` CLI and by the web form's import/export.
 */
import { z } from "zod";
import { ASSERTION_KINDS, type AssertionSpec } from "./assertions";
import { BASE_DEFAULTS, MAX_FAULTS, faultSchema, validateConfig } from "./config";
import { pipelineSchema } from "./pipeline";
import { getScenario, scenarioConfig } from "./scenarios";
import type { ExperimentConfig } from "./types";

const assertionSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    kind: z.enum(ASSERTION_KINDS),
    title: z.string().min(1).max(200).optional(),
    params: z.record(z.string(), z.number()).optional(),
  })
  .strict();

export const experimentFileSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    /** Start from a built-in scenario ("alert-service-outage", ...). Everything else here overrides it. */
    scenario: z.string().optional(),
    seed: z.number().int().min(0).optional(),
    eventCount: z.number().int().optional(),
    intervalSec: z.number().optional(),
    durationSec: z.number().optional(),
    mode: z.enum(["resilient", "faulty"]).optional(),
    faults: z.array(faultSchema).max(MAX_FAULTS).optional(),
    drainCapacityPerSec: z.number().optional(),
    patientCount: z.number().int().optional(),
    staleThresholdSec: z.number().optional(),
    pipeline: pipelineSchema.optional(),
    /** Replaces the default assertions for this experiment. */
    assertions: z.array(assertionSchema).optional(),
  })
  .strict();

export interface LoadedExperiment {
  config: ExperimentConfig;
  assertions?: AssertionSpec[];
}

export type ParseResult = { ok: true; experiments: LoadedExperiment[] } | { ok: false; errors: string[] };

/** Validates and resolves an experiment file into engine configs. Never throws. */
export function parseSuiteFile(json: unknown): ParseResult {
  const isList = typeof json === "object" && json !== null && "experiments" in json;
  const parsedList: z.infer<typeof experimentFileSchema>[] = [];
  const schemaErrors: string[] = [];
  if (isList) {
    const items = (json as { experiments: unknown }).experiments;
    if (!Array.isArray(items) || items.length === 0) return { ok: false, errors: ["experiments: must be a non-empty list"] };
    items.forEach((item, i) => {
      const r = experimentFileSchema.safeParse(item);
      if (r.success) parsedList.push(r.data);
      else r.error.issues.forEach((x) => schemaErrors.push(`experiments.${i}${x.path.length ? "." + x.path.join(".") : ""}: ${x.message}`));
    });
  } else {
    const r = experimentFileSchema.safeParse(json);
    if (r.success) parsedList.push(r.data);
    else r.error.issues.forEach((x) => schemaErrors.push(`${x.path.join(".") || "(file)"}: ${x.message}`));
  }
  if (schemaErrors.length) return { ok: false, errors: schemaErrors };
  const list = parsedList;
  const out: LoadedExperiment[] = [];
  const errors: string[] = [];
  list.forEach((e, idx) => {
    const where = list.length > 1 ? `experiments.${idx}` : "experiment";
    if (e.scenario && !getScenario(e.scenario)) {
      errors.push(`${where}.scenario: unknown scenario "${e.scenario}"`);
      return;
    }
    const base: ExperimentConfig = e.scenario
      ? scenarioConfig(e.scenario)
      : { name: "Custom experiment", scenarioId: "custom", ...BASE_DEFAULTS, faults: [], interventions: [] };
    const { assertions, scenario: _s, ...overrides } = e;
    const config: ExperimentConfig = { ...base, ...Object.fromEntries(Object.entries(overrides).filter(([, v]) => v !== undefined)), interventions: [] } as ExperimentConfig;
    if (!e.name && !e.scenario) config.name = `Custom experiment ${idx + 1}`;
    const v = validateConfig(config);
    if (!v.ok) {
      v.issues.forEach((i) => errors.push(`${where}.${i.path}: ${i.message}`));
      return;
    }
    out.push({
      config: v.config,
      assertions: assertions?.map((a, i) => ({ id: a.id ?? `${a.kind}-${i + 1}`, kind: a.kind, title: a.title ?? a.kind.replace(/_/g, " "), params: a.params })),
    });
  });
  return errors.length ? { ok: false, errors } : { ok: true, experiments: out };
}

/** Serializes a config back to an experiment file (the inverse of parseSuiteFile for a single experiment). */
export function configToFile(config: ExperimentConfig): Record<string, unknown> {
  const { scenarioId: _s, interventions: _i, ...rest } = config;
  return rest;
}
