/**
 * Assertion evaluation. Each assertion inspects real engine output; none has a hardcoded result.
 * An assertion whose precondition is absent (e.g. no outage was injected) is "not_applicable".
 */
import type { Metrics } from "./metrics";
import { INTENTIONAL_REASONS, PENDING_REASONS, ratio, type Ratio } from "./metrics";
import type { FaultConfig, ServiceId, SimulationResult } from "./types";

export type AssertionKind =
  | "all_processed"
  | "all_alerts_delivered"
  | "no_unexpected_loss"
  | "accounted_for"
  | "healthy_throughout"
  | "p95_alert_latency_max"
  | "service_unavailable_during_fault"
  | "no_work_during_outage"
  | "queue_visible_during_outage"
  | "processed_after_recovery"
  | "recovery_time_max"
  | "queue_drains"
  | "peak_queue_at_least"
  | "duplicates_all_rejected"
  | "no_duplicate_alerts_delivered"
  | "latency_reflects_delay"
  | "stale_flagged_when_delayed"
  | "latency_recovers"
  | "target_degraded_during_latency"
  | "loss_rate_within"
  | "gaps_detected"
  | "no_stale_overwrite"
  | "reordering_observed"
  | "event_time_preserved";

export interface AssertionSpec {
  id: string;
  kind: AssertionKind;
  title: string;
  params?: Record<string, number>;
}

export type AssertionStatus = "passed" | "failed" | "not_applicable";

export interface AssertionOutcome {
  id: string;
  kind: AssertionKind;
  title: string;
  status: AssertionStatus;
  expected: string;
  actual: string;
  /** Event IDs that support (or violate) the assertion; capped. */
  eventIds: string[];
}

const EVIDENCE_CAP = 25;

interface Ctx {
  r: SimulationResult;
  m: Metrics;
  spec: AssertionSpec;
}

type Verdict = Omit<AssertionOutcome, "id" | "kind" | "title"> | null;

const na = (): Verdict => null;
const pct = (n: number) => `${Math.round(n * 1000) / 10}%`;
const sec = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100) / 100}s`);

function verdict(pass: boolean, expected: string, actual: string, ids: string[] = []): Verdict {
  return { status: pass ? "passed" : "failed", expected, actual, eventIds: ids.slice(0, EVIDENCE_CAP) };
}

function endOf(f: FaultConfig, r: SimulationResult): number {
  return f.durationSec === null ? r.config.durationSec : f.startSec + f.durationSec;
}

function faultsOf(r: SimulationResult, type: FaultConfig["type"]): FaultConfig[] {
  const live = r.config.interventions.flatMap((iv) => (iv.type === "inject" ? [iv.fault] : []));
  return [...r.config.faults, ...live].filter((f) => f.type === type);
}

/** Per-service log event types that represent the service doing work. */
const WORK_TYPES: Record<ServiceId, string[]> = {
  device: ["in_transit"],
  ingestion: ["received"],
  processor: ["processed"],
  rules: ["alert_generated"],
  delivery: ["dispatch"],
  dashboard: ["delivered"],
};

const checks: Record<AssertionKind, (c: Ctx) => Verdict> = {
  all_processed({ m, spec }) {
    const min = spec.params?.min ?? 1;
    const v = m.processingSuccessRate;
    if (v.value === null) return na();
    return verdict(v.value >= min, `processing success ≥ ${pct(min)} (${v.label})`, `${pct(v.value)} (${v.numerator}/${v.denominator})`);
  },
  all_alerts_delivered({ m, spec, r }) {
    const min = spec.params?.min ?? 1;
    const v = m.deliveryRate;
    if (v.value === null) return na();
    const missing = r.events.filter((e) => e.expectedAlert && e.deliveredAt === null).map((e) => e.eventId);
    return verdict(v.value >= min, `delivery rate ≥ ${pct(min)} (${v.label})`, `${pct(v.value)} (${v.numerator}/${v.denominator})`, missing);
  },
  no_unexpected_loss({ r }) {
    const bad = r.events.filter((e) => e.processedAt === null && e.lossReason && !INTENTIONAL_REASONS.has(e.lossReason) && !PENDING_REASONS.has(e.lossReason));
    const alertBad = r.events.filter((e) => e.expectedAlert && e.deliveredAt === null && e.processedAt !== null && e.lossReason && !INTENTIONAL_REASONS.has(e.lossReason));
    const ids = [...new Set([...bad, ...alertBad].map((e) => e.eventId))];
    const reasonCounts = new Map<string, number>();
    for (const e of new Set([...bad, ...alertBad])) reasonCounts.set(e.lossReason as string, (reasonCounts.get(e.lossReason as string) ?? 0) + 1);
    const reasons = [...reasonCounts].map(([k, v]) => `${k}: ${v}`).join(", ");
    return verdict(ids.length === 0, "0 events lost for reasons other than injected packet loss", ids.length === 0 ? "0 unexpected losses" : `${ids.length} unexpected losses (${reasons})`, ids);
  },
  accounted_for({ r, m }) {
    const lostWithoutReason = r.events.filter((e) => (e.status === "dropped" || e.status === "failed") && !e.lossReason && e.processedAt === null && e.deliveredAt === null);
    const accounted = m.readingsProcessed + m.readingLoss.total;
    const reconciles = accounted === m.readingsGenerated;
    return verdict(
      lostWithoutReason.length === 0 && reconciles,
      "every generated reading is processed, or lost/pending with a recorded reason (processed + lost + pending = generated)",
      `${m.readingsProcessed} processed + ${m.readingLoss.total} lost/pending = ${accounted} of ${m.readingsGenerated} generated; ${lostWithoutReason.length} without a reason`,
      lostWithoutReason.map((e) => e.eventId),
    );
  },
  healthy_throughout({ r }) {
    const bad = Object.values(r.services).flatMap((s) => s.transitions.filter((t) => t.to !== "healthy").map((t) => `${s.id}→${t.to}@${sec(t.t)}`));
    return verdict(bad.length === 0, "all services stay healthy for the whole run", bad.length ? bad.slice(0, 4).join(", ") : "no non-healthy transitions");
  },
  p95_alert_latency_max({ m, spec }) {
    const max = spec.params?.maxSec ?? 2;
    const l = m.alertLatency;
    if (l.p95Sec === null) return na();
    return verdict(l.p95Sec <= max, `p95 alert latency ≤ ${max}s`, `p95 ${sec(l.p95Sec)} (n=${l.n})`);
  },
  service_unavailable_during_fault({ r }) {
    const outs = faultsOf(r, "outage");
    if (!outs.length) return na();
    const results = outs.map((f) => {
      const tr = r.services[f.target].transitions;
      const down = tr.find((t) => t.to === "unavailable" && t.t >= f.startSec - 0.001);
      return { f, down };
    });
    const failed = results.filter((x) => !x.down);
    return verdict(
      failed.length === 0,
      "target service is marked unavailable when the outage starts",
      results.map((x) => (x.down ? `${x.f.target} unavailable at ${sec(x.down.t)}` : `${x.f.target} never marked unavailable`)).join("; "),
    );
  },
  no_work_during_outage({ r }) {
    const outs = faultsOf(r, "outage");
    if (!outs.length) return na();
    const offenders: string[] = [];
    for (const f of outs) {
      const manualRecovery = r.timeline.find((t) => t.kind === "recovery_initiated" && t.service === f.target && t.t >= f.startSec);
      const end = manualRecovery ? manualRecovery.t : endOf(f, r);
      const types = WORK_TYPES[f.target];
      for (const l of r.log) {
        if (l.component === f.target && types.includes(l.type) && l.t >= f.startSec && l.t < end) offenders.push(l.eventId);
      }
      if (f.target === "delivery") {
        for (const e of r.events) if (e.deliveredAt !== null && e.deliveredAt >= f.startSec && e.deliveredAt < end) offenders.push(e.eventId);
      }
    }
    const uniq = [...new Set(offenders)];
    return verdict(
      uniq.length === 0,
      `no work attributed to the target service while it is unavailable (${outs.map((f) => f.target).join(", ")})`,
      uniq.length === 0 ? "0 events handled during the outage" : `${uniq.length} events handled during the outage`,
      uniq,
    );
  },
  queue_visible_during_outage({ r, spec }) {
    const outs = faultsOf(r, "outage");
    if (!outs.length) return na();
    const min = spec.params?.min ?? 1;
    const f = outs[0];
    const end = endOf(f, r);
    const peak = Math.max(0, ...r.samples.filter((s) => s.t >= f.startSec && s.t <= end).map((s) => s.depth[f.target]));
    return verdict(peak >= min, `queued events visible for ${f.target} (peak depth ≥ ${min})`, `peak depth ${peak} during the outage`);
  },
  processed_after_recovery({ r }) {
    const outs = faultsOf(r, "outage");
    if (!outs.length) return na();
    const f = outs[0];
    const end = endOf(f, r);
    const alertStage = f.target === "delivery" || f.target === "dashboard";
    const affected = r.events.filter((e) => e.eventTime >= f.startSec && e.eventTime < end && (!alertStage || e.expectedAlert));
    if (!affected.length) return na();
    const done = (e: (typeof affected)[number]) => (alertStage ? e.deliveredAt !== null : e.processedAt !== null);
    const missing = affected.filter((e) => !done(e));
    return verdict(
      missing.length === 0,
      `all ${affected.length} ${alertStage ? "alerts" : "readings"} generated during the outage are ${alertStage ? "delivered" : "processed"} after recovery`,
      `${affected.length - missing.length}/${affected.length} completed`,
      missing.map((e) => e.eventId),
    );
  },
  recovery_time_max({ m, spec, r }) {
    if (!faultsOf(r, "outage").length) return na();
    const max = spec.params?.maxSec ?? 60;
    if (m.recoveryTimeSec === null) return verdict(false, `recovery completes within ${max}s of restoration`, "recovery never completed within the window");
    return verdict(m.recoveryTimeSec <= max && !m.recoveryIncomplete, `recovery completes within ${max}s of restoration`, `${sec(m.recoveryTimeSec)} (restore → backlog drained)`);
  },
  queue_drains({ m, r }) {
    if (!faultsOf(r, "outage").length) return na();
    return verdict(m.finalQueueDepth === 0, "all queues, retry holds and dead-letter queues empty at end of window", `${m.finalQueueDepth} events still queued/held/dead-lettered`);
  },
  peak_queue_at_least({ m, spec }) {
    const min = spec.params?.min ?? 10;
    return verdict(m.peakQueueDepth >= min, `backlog builds to at least ${min} events`, `peak depth ${m.peakQueueDepth}${m.peakQueueService ? ` at ${m.peakQueueService}` : ""}`);
  },
  duplicates_all_rejected({ m, r }) {
    if (m.duplicatesInjected === 0) return na();
    const v: Ratio = m.duplicateRejectionRate;
    const accepted = r.log.filter((l) => l.type === "duplicate_accepted").map((l) => l.eventId);
    return verdict(v.value === 1, `100% of injected duplicates rejected (${v.label})`, `${pct(v.value ?? 0)} (${v.numerator}/${v.denominator}); ${m.duplicatesAccepted} accepted`, [...new Set(accepted)]);
  },
  no_duplicate_alerts_delivered({ m, r }) {
    if (m.duplicatesInjected === 0) return na();
    const ids = r.log.filter((l) => l.type === "duplicate_alert_delivered").map((l) => l.eventId);
    return verdict(m.duplicateAlertsDelivered === 0, "0 duplicate alerts shown to clinicians", `${m.duplicateAlertsDelivered} duplicate alerts delivered`, ids);
  },
  latency_reflects_delay({ r }) {
    const faults = faultsOf(r, "latency");
    if (!faults.length) return na();
    const f = faults[0];
    const tag = `latency@${f.target}`;
    const affected = r.events.filter((e) => e.faultTags.includes(tag) && e.processedAt !== null);
    if (!affected.length) return na();
    const lat = affected.map((e) => (e.processedAt as number) - e.eventTime);
    const min = Math.min(...lat);
    return verdict(min >= f.delaySec, `every affected reading takes ≥ the injected ${f.delaySec}s`, `${affected.length} affected readings, minimum latency ${sec(min)}`, affected.map((e) => e.eventId));
  },
  stale_flagged_when_delayed({ r }) {
    const faults = faultsOf(r, "latency").filter((f) => f.delaySec > r.config.staleThresholdSec);
    if (!faults.length) return na();
    const f = faults[0];
    const affected = r.events.filter((e) => e.faultTags.includes(`latency@${f.target}`));
    const flagged = affected.filter((e) => e.staleFlagged);
    return verdict(affected.length > 0 && flagged.length === affected.length, `delayed data older than ${r.config.staleThresholdSec}s is flagged stale`, `${flagged.length}/${affected.length} delayed events flagged stale`, affected.filter((e) => !e.staleFlagged).map((e) => e.eventId));
  },
  latency_recovers({ r, spec }) {
    const faults = faultsOf(r, "latency");
    if (!faults.length) return na();
    const f = faults[0];
    const max = spec.params?.maxSec ?? 2;
    const after = r.events.filter((e) => e.eventTime >= endOf(f, r) && e.processedAt !== null).map((e) => (e.processedAt as number) - e.eventTime);
    if (!after.length) return na();
    const worst = Math.max(...after);
    return verdict(worst <= max, `readings generated after the fault ends return to ≤ ${max}s latency`, `${after.length} later readings, worst latency ${sec(worst)}`);
  },
  target_degraded_during_latency({ r }) {
    const faults = faultsOf(r, "latency");
    if (!faults.length) return na();
    const f = faults[0];
    const hit = r.services[f.target].transitions.find((t) => t.to === "degraded" && t.t >= f.startSec - 0.001 && t.t <= endOf(f, r));
    return verdict(!!hit, `${f.target} is marked degraded while the latency fault is active`, hit ? `degraded at ${sec(hit.t)}` : "never marked degraded");
  },
  loss_rate_within({ r, spec }) {
    const faults = faultsOf(r, "packet_loss");
    if (!faults.length) return na();
    const f = faults[0];
    const tol = spec.params?.tolerance ?? 0.08;
    const end = endOf(f, r);
    const eligible = r.events.filter((e) => e.eventTime >= f.startSec && e.eventTime < end);
    if (!eligible.length) return na();
    const lost = eligible.filter((e) => e.lossReason === "packet_loss_injected" && e.lossStage === f.target);
    const observed = lost.length / eligible.length;
    return verdict(Math.abs(observed - f.intensity) <= tol, `observed loss within ±${pct(tol)} of the configured ${pct(f.intensity)}`, `${pct(observed)} (${lost.length}/${eligible.length} eligible events)`, lost.map((e) => e.eventId));
  },
  gaps_detected({ r }) {
    const faults = faultsOf(r, "packet_loss").filter((f) => f.target === "ingestion");
    if (!faults.length) return na();
    const lost = r.events.filter((e) => e.lossReason === "packet_loss_injected" && e.lossStage === "ingestion" && e.processedAt === null);
    if (!lost.length) return na();
    const known = new Set([...r.gaps.detectedBySequence, ...r.gaps.detectedByReconciliation]);
    const unseen = lost.filter((e) => !known.has(e.eventId));
    return verdict(unseen.length === 0, "every dropped reading is identified by sequence-gap detection or end-of-run reconciliation", `${lost.length - unseen.length}/${lost.length} identified`, unseen.map((e) => e.eventId));
  },
  no_stale_overwrite({ m, r }) {
    if (!faultsOf(r, "out_of_order").length) return na();
    const ids = r.log.filter((l) => l.type === "stale_overwrite").map((l) => l.eventId);
    return verdict(m.staleOverwrites === 0, "no newer measurement is overwritten by an older one", `${m.staleOverwrites} stale overwrites`, ids);
  },
  reordering_observed({ m, r }) {
    if (!faultsOf(r, "out_of_order").length) return na();
    return verdict(m.reorderedReadings > 0, "older readings are processed after newer readings from the same device", `${m.reorderedReadings} readings arrived out of order`);
  },
  event_time_preserved({ r }) {
    if (!faultsOf(r, "out_of_order").length) return na();
    const interval = r.config.intervalSec;
    const bad = r.events.filter((e) => Math.abs(e.eventTime - (Number(e.eventId.slice(4)) - 1) * interval) > 0.001);
    const late = r.events.filter((e) => e.processedAt !== null && e.processedAt > e.eventTime);
    return verdict(bad.length === 0 && late.length > 0, "event time is preserved and distinct from processing time", `${bad.length} events with altered event time; ${late.length} processed after their event time`, bad.map((e) => e.eventId));
  },
};

export function evaluateAssertions(result: SimulationResult, metrics: Metrics, specs: AssertionSpec[]): AssertionOutcome[] {
  return specs.map((spec) => {
    const v = checks[spec.kind]({ r: result, m: metrics, spec });
    if (!v) return { id: spec.id, kind: spec.kind, title: spec.title, status: "not_applicable", expected: "n/a", actual: "Precondition for this assertion was not present in the run.", eventIds: [] };
    return { id: spec.id, kind: spec.kind, title: spec.title, ...v };
  });
}

export function assertionPassRate(outcomes: AssertionOutcome[]): Ratio {
  const applicable = outcomes.filter((o) => o.status !== "not_applicable");
  return ratio(applicable.filter((o) => o.status === "passed").length, applicable.length, "assertions passed ÷ applicable assertions", "No assertions were applicable.");
}
