/**
 * Core types for the CareChaos simulation engine.
 * All data is synthetic. Times in results are virtual seconds since experiment start.
 */

export const SERVICE_IDS = ["device", "ingestion", "processor", "rules", "delivery", "dashboard"] as const;
export type ServiceId = (typeof SERVICE_IDS)[number];

export const SERVICE_LABELS: Record<ServiceId, string> = {
  device: "Device Simulator",
  ingestion: "Ingestion API",
  processor: "Readings Processor",
  rules: "Alert Rules Engine",
  delivery: "Delivery Service",
  dashboard: "Clinician Dashboard",
};

export type Health = "healthy" | "degraded" | "unavailable" | "recovering";

export type EventStatus =
  | "generated"
  | "in_transit"
  | "delayed"
  | "received"
  | "queued"
  | "processed"
  | "alert_generated"
  | "delivered"
  | "dropped"
  | "rejected_duplicate"
  | "failed";

export type Measurement = "heart_rate" | "oxygen_saturation" | "systolic_bp";
export const MEASUREMENT_UNITS: Record<Measurement, string> = {
  heart_rate: "bpm",
  oxygen_saturation: "%",
  systolic_bp: "mmHg",
};

export type FaultType = "latency" | "duplicate" | "outage" | "packet_loss" | "out_of_order";
export type ResilienceMode = "resilient" | "faulty";

export interface FaultConfig {
  type: FaultType;
  target: ServiceId;
  /** Virtual second at which the fault becomes active. */
  startSec: number;
  /** Duration in virtual seconds; null = until manually recovered (outage) or end of run. */
  durationSec: number | null;
  /** Fraction 0..1 of eligible events affected (duplicate, packet_loss, out_of_order). Ignored for latency/outage. */
  intensity: number;
  /** Seconds of added delay (latency) or hold time (out_of_order). */
  delaySec: number;
}

export type Intervention =
  | { atSec: number; type: "recover"; service: ServiceId }
  | { atSec: number; type: "inject"; fault: FaultConfig }
  | { atSec: number; type: "stop" };

export interface AlertRuleConfig {
  op: ">" | "<";
  threshold: number;
}

/** Optional overrides describing your own pipeline. Anything omitted uses the built-in default. */
export interface PipelineConfig {
  /** Events per second each stage can process (the Clinician Dashboard defaults to instant). */
  capacities?: Partial<Record<ServiceId, number>>;
  /** Inbound queue limit per stage (default 1000). Overflow is dropped with a recorded reason. */
  queueCapacity?: number;
  /** Resilient-mode sender retry policy: bounded retries with exponential backoff. */
  retry?: { maxRetries: number; baseSec: number; capSec: number };
  /**
   * Resilient mode: park events whose retries are exhausted in a dead-letter queue and redrive them on recovery (default true).
   * Set false to model a pipeline that simply discards an event after its last retry.
   */
  deadLetterRedrive?: boolean;
  /** Seconds a restored service stays in the recovering state at minimum (default 2). */
  recoveryWarmupSec?: number;
  /** A stage is marked degraded when its queue reaches this depth (default 25). */
  degradedQueueDepth?: number;
  /** Alert rule per measurement, e.g. heart_rate > 120. */
  alertRules?: Partial<Record<Measurement, AlertRuleConfig>>;
}

export interface ExperimentConfig {
  name: string;
  scenarioId: string;
  seed: number;
  /** Number of synthetic readings generated. */
  eventCount: number;
  /** Virtual seconds between consecutive readings (across all devices). */
  intervalSec: number;
  /** Observation window in virtual seconds. */
  durationSec: number;
  mode: ResilienceMode;
  faults: FaultConfig[];
  /** Processing capacity (events/s) of a service while it is draining after an outage. */
  drainCapacityPerSec: number;
  patientCount: number;
  /** Age (virtual s) beyond which data is flagged stale in resilient mode. */
  staleThresholdSec: number;
  /** Your pipeline's capacities, retry policy and alert rules. Omit to use the defaults. */
  pipeline?: PipelineConfig;
  /** Operator actions recorded during a live run (manual recovery, live fault injection, stop). */
  interventions: Intervention[];
}

export type RunStatus = "idle" | "running" | "paused" | "completed" | "stopped";

export interface TransitionEntry {
  t: number;
  status: EventStatus;
  component: ServiceId;
  copy: number;
  reason: string;
}

export interface EventRecord {
  eventId: string;
  patientId: string;
  deviceId: string;
  seq: number;
  measurement: Measurement;
  value: number;
  unit: string;
  eventTime: number;
  arrivalTime: number | null;
  status: EventStatus;
  expectedAlert: boolean;
  processedAt: number | null;
  alertGeneratedAt: number | null;
  deliveredAt: number | null;
  lossReason: string | null;
  lossStage: ServiceId | null;
  duplicateCopies: number;
  lateArrival: boolean;
  staleOverwrite: boolean;
  staleFlagged: boolean;
  deadLettered: boolean;
  retries: number;
  delayedBySec: number;
  faultTags: string[];
  transitions: TransitionEntry[];
}

export interface LogEntry {
  t: number;
  n: number;
  eventId: string;
  copy: number;
  component: ServiceId;
  type: string;
  status: EventStatus;
  explanation: string;
}

export interface TimelineEntry {
  t: number;
  kind:
    | "run_started"
    | "run_completed"
    | "run_stopped"
    | "fault_started"
    | "fault_ended"
    | "service_state"
    | "recovery_initiated"
    | "recovery_completed"
    | "intervention"
    | "gap_detected";
  service?: ServiceId;
  detail: string;
}

export interface RecoveryRecord {
  service: ServiceId;
  initiatedAt: number;
  completedAt: number | null;
  trigger: "automatic" | "manual";
}

export interface Sample {
  t: number;
  depth: Record<ServiceId, number>;
  totalDepth: number;
  health: Record<ServiceId, Health>;
  generated: number;
  processed: number;
  delivered: number;
  failed: number;
  /** Mean generation->processed latency (s) of readings processed in this sample interval. */
  latencySec: number | null;
}

export interface ServiceSummary {
  id: ServiceId;
  health: Health;
  received: number;
  processed: number;
  failed: number;
  duplicatesRejected: number;
  queueDepth: number;
  peakQueueDepth: number;
  capacityPerSec: number;
  transitions: { t: number; from: Health | null; to: Health; reason: string }[];
  recoveries: RecoveryRecord[];
  activeFaults: FaultConfig[];
}

export interface GapReport {
  /** Event IDs identified as missing by the sequence tracker (a later seq from the same device arrived). */
  detectedBySequence: string[];
  /** Event IDs identified as missing by end-of-run reconciliation against the expected count. */
  detectedByReconciliation: string[];
}

export interface SimulationResult {
  config: ExperimentConfig;
  status: RunStatus;
  nowSec: number;
  events: EventRecord[];
  log: LogEntry[];
  timeline: TimelineEntry[];
  samples: Sample[];
  services: Record<ServiceId, ServiceSummary>;
  gaps: GapReport;
  counters: {
    duplicatesInjected: number;
    duplicatesRejected: number;
    duplicatesAccepted: number;
    duplicateAlertsDelivered: number;
    packetsDropped: number;
    staleOverwrites: number;
    lateArrivals: number;
    staleFlagged: number;
  };
}
