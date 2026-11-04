import { BASE_DEFAULTS, makeFault } from "./config";
import type { AssertionSpec } from "./assertions";
import type { ExperimentConfig, FaultConfig, FaultType } from "./types";

export interface Scenario {
  id: string;
  name: string;
  description: string;
  hypothesis: string;
  initialConditions: string;
  expectedBehavior: string;
  relevantMetrics: string[];
  faults: FaultConfig[];
  overrides: Partial<ExperimentConfig>;
  assertions: AssertionSpec[];
}

const a = (id: string, kind: AssertionSpec["kind"], title: string, params?: Record<string, number>): AssertionSpec => ({ id, kind, title, params });

const COMMON: AssertionSpec[] = [
  a("accounted", "accounted_for", "No event is silently lost: every reading is processed or has a recorded loss reason"),
  a("no-unexpected-loss", "no_unexpected_loss", "No readings or alerts are lost for reasons other than the injected fault"),
];

export const SCENARIOS: Scenario[] = [
  {
    id: "healthy-baseline",
    name: "Healthy baseline",
    description: "No faults. Establishes the reference behavior and latency of the pipeline.",
    hypothesis: "With no faults injected, every reading is processed, every expected alert is delivered promptly, and all services stay healthy.",
    initialConditions: "200 synthetic readings at 1 per second from 4 fictional devices; all services healthy; default capacities.",
    expectedBehavior: "100% processing and delivery, p95 alert latency under 2 virtual seconds, no queue buildup.",
    relevantMetrics: ["Processing success rate", "Delivery rate", "p95 alert latency", "Peak queue depth"],
    faults: [],
    overrides: {},
    assertions: [
      a("all-processed", "all_processed", "All readings are processed"),
      a("all-delivered", "all_alerts_delivered", "All expected alerts are delivered"),
      a("healthy", "healthy_throughout", "All services remain healthy throughout"),
      a("p95", "p95_alert_latency_max", "p95 end-to-end alert latency ≤ 2s", { maxSec: 2 }),
      ...COMMON,
    ],
  },
  {
    id: "delayed-readings",
    name: "Delayed readings",
    description: "Adds 15 virtual seconds of latency on the Readings Processor input for one minute.",
    hypothesis: "If the processor is slowed by 15s, readings still arrive intact but late; the service reports degraded, stale data is flagged, and latency returns to normal after the fault ends.",
    initialConditions: "Baseline traffic. Latency fault of +15s on the Readings Processor from t=40s to t=100s. Stale threshold 10s.",
    expectedBehavior: "Affected readings take at least 15s end to end, are flagged stale, nothing is lost, and later readings return to baseline latency.",
    relevantMetrics: ["Median and p95 latency", "Stale-flagged events", "Delivery rate"],
    faults: [makeFault({ type: "latency", target: "processor", startSec: 40, durationSec: 60, delaySec: 15, intensity: 1 })],
    overrides: {},
    assertions: [
      a("degraded", "target_degraded_during_latency", "The delayed service is reported as degraded during the fault"),
      a("delay-visible", "latency_reflects_delay", "Affected readings show at least the injected delay"),
      a("stale", "stale_flagged_when_delayed", "Delayed data is flagged stale"),
      a("recovers", "latency_recovers", "Latency returns to baseline after the fault ends", { maxSec: 3 }),
      a("all-delivered", "all_alerts_delivered", "All expected alerts are eventually delivered"),
      ...COMMON,
    ],
  },
  {
    id: "duplicate-events",
    name: "Duplicate events",
    description: "Replays 30% of incoming readings with the same event ID.",
    hypothesis: "If devices or networks redeliver readings, an idempotent pipeline processes each event ID once and never shows a clinician the same alert twice.",
    initialConditions: "Baseline traffic. Duplicate delivery on the Ingestion API at 30% intensity from t=30s to t=150s.",
    expectedBehavior: "Every injected duplicate is rejected, accepted and rejected events are counted separately, no duplicate alerts reach the dashboard.",
    relevantMetrics: ["Duplicate rejection rate", "Duplicates accepted", "Duplicate alerts delivered"],
    faults: [makeFault({ type: "duplicate", target: "ingestion", startSec: 30, durationSec: 120, intensity: 0.3 })],
    overrides: {},
    assertions: [
      a("dup-rejected", "duplicates_all_rejected", "All injected duplicates are rejected"),
      a("dup-alerts", "no_duplicate_alerts_delivered", "No duplicate alerts are delivered"),
      a("all-processed", "all_processed", "Each unique reading is processed exactly once"),
      a("all-delivered", "all_alerts_delivered", "All expected alerts are delivered"),
      ...COMMON,
    ],
  },
  {
    id: "alert-service-outage",
    name: "Alert service outage",
    description: "The Delivery Service is unavailable for 60 virtual seconds, then recovers automatically.",
    hypothesis: "If the alert service becomes unavailable, events remain queued and are processed after recovery, within the configured limits.",
    initialConditions: "Baseline traffic. Outage of the Delivery Service from t=60s to t=120s. Retry: 8 attempts, exponential backoff 1–8s, dead-letter redrive on recovery.",
    expectedBehavior: "Delivery stops during the outage, the backlog is visible, nothing is lost, and queued alerts are delivered after recovery.",
    relevantMetrics: ["Queue depth", "Recovery time", "Delivery rate", "Data loss by reason"],
    faults: [makeFault({ type: "outage", target: "delivery", startSec: 60, durationSec: 60 })],
    overrides: {},
    assertions: [
      a("unavailable", "service_unavailable_during_fault", "The service is marked unavailable during the fault"),
      a("no-delivery", "no_work_during_outage", "No alert is reported as delivered while the service is unavailable"),
      a("queued", "queue_visible_during_outage", "Queued events are visible during the outage"),
      a("after-recovery", "processed_after_recovery", "Queued events are delivered after recovery"),
      a("recovery-time", "recovery_time_max", "Recovery completes within 60s", { maxSec: 60 }),
      a("drains", "queue_drains", "Queues are fully drained by the end of the window"),
      ...COMMON,
    ],
  },
  {
    id: "packet-loss",
    name: "Missing data / packet loss",
    description: "Drops 10% of readings before they reach the Ingestion API.",
    hypothesis: "If the link drops readings, the pipeline can detect the gaps via sequence numbers or end-of-run reconciliation, and loss is attributed to the injected fault, not to an unknown cause.",
    initialConditions: "Baseline traffic. Packet loss of 10% into the Ingestion API from t=10s to t=190s. Each device numbers its readings sequentially.",
    expectedBehavior: "Observed loss is close to 10%, every missing reading is identified, and no other loss occurs.",
    relevantMetrics: ["Observed loss rate", "Gaps detected", "Data loss by reason", "Processing success rate (excluding intentional loss)"],
    faults: [makeFault({ type: "packet_loss", target: "ingestion", startSec: 10, durationSec: 180, intensity: 0.1 })],
    overrides: {},
    assertions: [
      a("loss-rate", "loss_rate_within", "Observed loss matches the configured rate (±8 points)", { tolerance: 0.08 }),
      a("gaps", "gaps_detected", "Every dropped reading is identified as a gap"),
      a("all-processed", "all_processed", "All readings that were not intentionally dropped are processed"),
      ...COMMON,
    ],
  },
  {
    id: "recovery-backlog",
    name: "Recovery backlog",
    description: "The Readings Processor is down for 60s at 2 readings/s, then drains its backlog at a limited capacity.",
    hypothesis: "If the processor is down, a backlog builds; after recovery it drains at the configured capacity without losing events, and the recovery time is bounded.",
    initialConditions: "400 readings at 2/s. Outage of the Readings Processor from t=40s to t=100s. Drain capacity 3 events/s while recovering.",
    expectedBehavior: "Queue depth rises to roughly 120, drains after recovery, recovery time reflects (backlog ÷ net drain rate), and nothing is lost.",
    relevantMetrics: ["Queue depth over time", "Drain time / recovery time", "Peak backlog", "Data loss"],
    faults: [makeFault({ type: "outage", target: "processor", startSec: 40, durationSec: 60 })],
    overrides: { eventCount: 400, intervalSec: 0.5, drainCapacityPerSec: 3 },
    assertions: [
      a("unavailable", "service_unavailable_during_fault", "The processor is marked unavailable during the fault"),
      a("backlog", "peak_queue_at_least", "A backlog of at least 50 events builds", { min: 50 }),
      a("after-recovery", "processed_after_recovery", "Backlogged readings are processed after recovery"),
      a("recovery-time", "recovery_time_max", "Backlog drains within 180s of restoration", { maxSec: 180 }),
      a("drains", "queue_drains", "Queues are fully drained by the end of the window"),
      ...COMMON,
    ],
  },
  {
    id: "out-of-order",
    name: "Out-of-order events",
    description: "Holds 25% of readings for 8s so that newer readings overtake them.",
    hypothesis: "If readings arrive out of order, event time is preserved and an older reading never overwrites a newer measurement.",
    initialConditions: "Baseline traffic. Out-of-order delivery into the Ingestion API at 25% intensity with an 8s hold, from t=20s to t=140s.",
    expectedBehavior: "Reordering is observed, event timestamps are unchanged, and no stale overwrite of newer data occurs.",
    relevantMetrics: ["Reordered readings", "Late arrivals", "Stale overwrites"],
    faults: [makeFault({ type: "out_of_order", target: "ingestion", startSec: 20, durationSec: 120, intensity: 0.25, delaySec: 8 })],
    overrides: {},
    assertions: [
      a("reordered", "reordering_observed", "Reordering is observed in processing order"),
      a("time-kept", "event_time_preserved", "Event time is preserved and distinct from processing time"),
      a("no-overwrite", "no_stale_overwrite", "No newer measurement is overwritten by an older one"),
      a("all-processed", "all_processed", "All readings are processed"),
      a("all-delivered", "all_alerts_delivered", "All expected alerts are delivered"),
      ...COMMON,
    ],
  },
];

export const DEMO_SCENARIO_ID = "alert-service-outage";

export function getScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function scenarioConfig(id: string, overrides: Partial<ExperimentConfig> = {}): ExperimentConfig {
  const s = getScenario(id);
  if (!s) throw new Error(`Unknown scenario "${id}"`);
  return {
    name: s.name,
    scenarioId: s.id,
    ...BASE_DEFAULTS,
    ...s.overrides,
    faults: structuredClone(s.faults),
    interventions: [],
    ...overrides,
  };
}

const FAULT_ASSERTIONS: Record<FaultType, AssertionSpec[]> = {
  latency: [
    a("g-degraded", "target_degraded_during_latency", "The delayed service is reported as degraded during the fault"),
    a("g-delay", "latency_reflects_delay", "Affected readings show at least the injected delay"),
    a("g-stale", "stale_flagged_when_delayed", "Delayed data is flagged stale"),
    a("g-recovers", "latency_recovers", "Latency returns to baseline after the fault ends", { maxSec: 3 }),
  ],
  duplicate: [
    a("g-dup", "duplicates_all_rejected", "All injected duplicates are rejected"),
    a("g-dup-alerts", "no_duplicate_alerts_delivered", "No duplicate alerts are delivered"),
  ],
  outage: [
    a("g-unavailable", "service_unavailable_during_fault", "The service is marked unavailable during the fault"),
    a("g-no-work", "no_work_during_outage", "The service does no work while unavailable"),
    a("g-queue", "queue_visible_during_outage", "Queued events are visible during the outage"),
    a("g-after", "processed_after_recovery", "Events generated during the outage complete after recovery"),
    a("g-recovery", "recovery_time_max", "Recovery completes within 120s", { maxSec: 120 }),
    a("g-drains", "queue_drains", "Queues are fully drained by the end of the window"),
  ],
  packet_loss: [
    a("g-rate", "loss_rate_within", "Observed loss matches the configured rate (±8 points)", { tolerance: 0.08 }),
    a("g-gaps", "gaps_detected", "Every dropped reading is identified as a gap"),
  ],
  out_of_order: [
    a("g-reorder", "reordering_observed", "Reordering is observed in processing order"),
    a("g-time", "event_time_preserved", "Event time is preserved and distinct from processing time"),
    a("g-overwrite", "no_stale_overwrite", "No newer measurement is overwritten by an older one"),
  ],
};

/**
 * Assertion list for a config: the scenario's own list when its fault types still match,
 * otherwise a list generated from the faults actually configured (including live-injected ones).
 */
export function assertionsFor(config: ExperimentConfig): AssertionSpec[] {
  const injected = config.interventions.flatMap((iv) => (iv.type === "inject" ? [iv.fault] : []));
  const types = [...new Set([...config.faults, ...injected].map((f) => f.type))].sort();
  const scenario = getScenario(config.scenarioId);
  if (scenario) {
    const st = [...new Set(scenario.faults.map((f) => f.type))].sort();
    if (st.join() === types.join()) return scenario.assertions;
  }
  return generatedAssertions(types);
}

/** Assertions derived from the fault types present (used for custom experiments and game days). */
export function generatedAssertions(types: FaultType[]): AssertionSpec[] {
  const specs: AssertionSpec[] = [];
  if (!types.length) {
    specs.push(a("g-healthy", "healthy_throughout", "All services remain healthy throughout"), a("g-p95", "p95_alert_latency_max", "p95 end-to-end alert latency ≤ 2s", { maxSec: 2 }));
  }
  specs.push(a("g-processed", "all_processed", "All readings not intentionally dropped are processed"));
  if (!types.includes("packet_loss")) specs.push(a("g-delivered", "all_alerts_delivered", "All expected alerts are delivered"));
  types.forEach((t) => specs.push(...FAULT_ASSERTIONS[t]));
  specs.push(...COMMON);
  return specs;
}

const GAME_DAY_FAULTS = [
  makeFault({ type: "latency", target: "processor", startSec: 30, durationSec: 50, delaySec: 15, intensity: 1 }),
  makeFault({ type: "duplicate", target: "ingestion", startSec: 60, durationSec: 150, intensity: 0.3 }),
  makeFault({ type: "outage", target: "delivery", startSec: 100, durationSec: 50 }),
  makeFault({ type: "packet_loss", target: "ingestion", startSec: 160, durationSec: 80, intensity: 0.1 }),
  makeFault({ type: "outage", target: "processor", startSec: 220, durationSec: 30 }),
];

/** A "bad afternoon": five overlapping and consecutive faults in one run. */
SCENARIOS.push({
  id: "game-day",
  name: "Game day: a bad afternoon",
  description: "Five failures in one run: a slow processor, duplicate deliveries, a delivery outage, packet loss and a processor outage.",
  hypothesis: "A resilient pipeline absorbs a sequence of unrelated failures: nothing is lost except what the experiment drops on purpose, every duplicate is rejected, and each outage drains after recovery.",
  initialConditions: "300 readings at 1 per second over a 420 s window. Faults start and stop on a schedule, some overlapping (see the timeline).",
  expectedBehavior: "Each fault shows its own impact and recovery. The only losses are the injected packet loss. All queues are empty at the end.",
  relevantMetrics: ["Recovery time per outage", "Duplicate rejection rate", "Observed loss rate", "Peak queue depth"],
  faults: GAME_DAY_FAULTS,
  overrides: { eventCount: 300, durationSec: 420 },
  assertions: generatedAssertions([...new Set(GAME_DAY_FAULTS.map((f) => f.type))].sort() as FaultType[]),
});
