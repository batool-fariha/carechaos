/**
 * Reliability metrics, all derived from a SimulationResult (events, timestamps, counters).
 * Every ratio carries its numerator, denominator and a label so the UI and reports never hide a denominator.
 */
import { SERVICE_IDS, type RecoveryRecord, type ServiceId, type SimulationResult } from "./types";

export interface Ratio {
  value: number | null;
  numerator: number;
  denominator: number;
  label: string;
  /** Present when the value is null because the denominator is zero. */
  note?: string;
}

export interface LatencyStats {
  n: number;
  medianSec: number | null;
  p95Sec: number | null;
  maxSec: number | null;
  basis: string;
  note?: string;
}

export type LossReason =
  | "packet_loss_injected"
  | "target_unavailable"
  | "queue_lost_on_crash"
  | "queue_overflow"
  | "retries_exhausted"
  | "in_flight_at_window_end"
  | "stopped_before_completion"
  | string;

/** Reasons that reflect the experiment's own intent, not a system defect. */
export const INTENTIONAL_REASONS = new Set<string>(["packet_loss_injected"]);
/** Not lost: still in a queue, retry timer or link when the window closed or the run was stopped. */
export const PENDING_REASONS = new Set<string>(["in_flight_at_window_end", "stopped_before_completion"]);

export interface LossBreakdown {
  total: number;
  intentional: number;
  unexpected: number;
  pending: number;
  byReason: Record<string, number>;
}

export interface RecoveryMetric extends RecoveryRecord {
  durationSec: number | null;
}

export interface Metrics {
  readingsGenerated: number;
  readingsProcessed: number;
  alertsExpected: number;
  alertsDelivered: number;
  duplicatesInjected: number;
  duplicatesRejected: number;
  duplicatesAccepted: number;
  duplicateAlertsDelivered: number;
  eventsDropped: number;
  eventsDeadLettered: number;
  staleFlagged: number;
  staleOverwrites: number;
  lateArrivals: number;
  reorderedReadings: number;
  deliveryRate: Ratio;
  processingSuccessRate: Ratio;
  duplicateRejectionRate: Ratio;
  readingLatency: LatencyStats;
  alertLatency: LatencyStats;
  recoveries: RecoveryMetric[];
  /** Longest completed recovery, or null when no outage recovery completed. */
  recoveryTimeSec: number | null;
  recoveryIncomplete: boolean;
  readingLoss: LossBreakdown;
  alertLoss: LossBreakdown;
  peakQueueDepth: number;
  peakQueueService: ServiceId | null;
  finalQueueDepth: number;
  outcomes: Record<string, number>;
  /** Filled after assertions are evaluated. */
  assertionPassRate: Ratio | null;
}

export function ratio(numerator: number, denominator: number, label: string, zeroNote: string): Ratio {
  if (denominator === 0) return { value: null, numerator, denominator, label, note: zeroNote };
  return { value: numerator / denominator, numerator, denominator, label };
}

export function quantile(sorted: number[], q: number): number {
  const idx = Math.max(0, Math.ceil(q * sorted.length) - 1);
  return sorted[idx];
}

export function latencyStats(values: number[], basis: string): LatencyStats {
  const n = values.length;
  if (n === 0) return { n, medianSec: null, p95Sec: null, maxSec: null, basis, note: "No samples." };
  const s = [...values].sort((a, b) => a - b);
  const p95 = n >= 20 ? quantile(s, 0.95) : null;
  return {
    n,
    medianSec: quantile(s, 0.5),
    p95Sec: p95,
    maxSec: s[n - 1],
    basis,
    note: n < 20 ? `p95 omitted: needs at least 20 samples (have ${n}).` : undefined,
  };
}

function classify(result: SimulationResult, lossReason: string | null): string {
  if (lossReason) return lossReason;
  return result.status === "stopped" ? "stopped_before_completion" : "in_flight_at_window_end";
}

function breakdown(reasons: string[]): LossBreakdown {
  const byReason: Record<string, number> = {};
  let intentional = 0;
  let pending = 0;
  for (const r of reasons) {
    byReason[r] = (byReason[r] ?? 0) + 1;
    if (INTENTIONAL_REASONS.has(r)) intentional++;
    else if (PENDING_REASONS.has(r)) pending++;
  }
  return { total: reasons.length, intentional, pending, unexpected: reasons.length - intentional - pending, byReason };
}

export function computeMetrics(result: SimulationResult): Metrics {
  const ev = result.events;
  const processed = ev.filter((e) => e.processedAt !== null);
  const expectedAlerts = ev.filter((e) => e.expectedAlert);
  const delivered = expectedAlerts.filter((e) => e.deliveredAt !== null);

  const unprocessed = ev.filter((e) => e.processedAt === null);
  const readingLoss = breakdown(unprocessed.map((e) => classify(result, e.lossReason)));
  const undelivered = expectedAlerts.filter((e) => e.deliveredAt === null);
  const alertLoss = breakdown(undelivered.map((e) => classify(result, e.lossReason)));

  const intentionalReadingLoss = readingLoss.intentional;
  const processingSuccessRate = ratio(
    processed.length,
    ev.length - intentionalReadingLoss,
    "unique readings processed ÷ readings generated minus intentionally dropped",
    "No readings were expected to be processed.",
  );
  const deliveryRate = ratio(delivered.length, expectedAlerts.length, "expected alerts delivered ÷ alerts expected", "No alerts were expected (no reading breached a rule).");
  const duplicateRejectionRate = ratio(
    result.counters.duplicatesRejected,
    result.counters.duplicatesInjected,
    "duplicates rejected ÷ duplicates injected",
    "No duplicates were injected.",
  );

  const recoveries: RecoveryMetric[] = SERVICE_IDS.flatMap((id) => result.services[id].recoveries).map((r) => ({
    ...r,
    durationSec: r.completedAt === null ? null : round3(r.completedAt - r.initiatedAt),
  }));
  const completed = recoveries.filter((r) => r.durationSec !== null).map((r) => r.durationSec as number);

  let peak = 0;
  let peakSvc: ServiceId | null = null;
  for (const id of SERVICE_IDS) {
    if (result.services[id].peakQueueDepth > peak) {
      peak = result.services[id].peakQueueDepth;
      peakSvc = id;
    }
  }
  const finalDepth = SERVICE_IDS.reduce((a, id) => a + result.services[id].queueDepth, 0);

  const outcomes: Record<string, number> = {};
  for (const e of ev) outcomes[e.status] = (outcomes[e.status] ?? 0) + 1;

  return {
    readingsGenerated: ev.length,
    readingsProcessed: processed.length,
    alertsExpected: expectedAlerts.length,
    alertsDelivered: delivered.length,
    duplicatesInjected: result.counters.duplicatesInjected,
    duplicatesRejected: result.counters.duplicatesRejected,
    duplicatesAccepted: result.counters.duplicatesAccepted,
    duplicateAlertsDelivered: result.counters.duplicateAlertsDelivered,
    eventsDropped: ev.filter((e) => e.status === "dropped").length,
    eventsDeadLettered: ev.filter((e) => e.deadLettered && e.processedAt === null).length,
    staleFlagged: result.counters.staleFlagged,
    staleOverwrites: result.counters.staleOverwrites,
    lateArrivals: result.counters.lateArrivals,
    reorderedReadings: countReordered(result),
    deliveryRate,
    processingSuccessRate,
    duplicateRejectionRate,
    readingLatency: latencyStats(
      processed.map((e) => (e.processedAt as number) - e.eventTime),
      "event (generation) time → processed time, per unique reading",
    ),
    alertLatency: latencyStats(
      delivered.map((e) => (e.deliveredAt as number) - e.eventTime),
      "event (generation) time → delivered-to-dashboard time, per unique alert",
    ),
    recoveries,
    recoveryTimeSec: completed.length ? Math.max(...completed) : null,
    recoveryIncomplete: recoveries.some((r) => r.completedAt === null),
    readingLoss,
    alertLoss,
    peakQueueDepth: peak,
    peakQueueService: peakSvc,
    finalQueueDepth: finalDepth,
    outcomes,
    assertionPassRate: null,
  };
}

/** Readings processed after a reading from the same device with a later event time. */
function countReordered(result: SimulationResult): number {
  const byDevice = new Map<string, typeof result.events>();
  for (const e of result.events) {
    if (e.processedAt === null) continue;
    const list = byDevice.get(e.deviceId) ?? [];
    list.push(e);
    byDevice.set(e.deviceId, list);
  }
  let n = 0;
  for (const list of byDevice.values()) {
    const ordered = [...list].sort((a, b) => (a.processedAt as number) - (b.processedAt as number) || a.eventTime - b.eventTime);
    let maxSeen = -Infinity;
    for (const e of ordered) {
      if (e.eventTime < maxSeen) n++;
      maxSeen = Math.max(maxSeen, e.eventTime);
    }
  }
  return n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
