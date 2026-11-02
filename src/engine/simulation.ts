/**
 * Deterministic, event-driven simulation of a synthetic remote patient-monitoring pipeline:
 *
 *   Device -> Ingestion API -> Readings Processor -> Alert Rules -> Delivery -> Clinician Dashboard
 *
 * The engine owns a virtual clock (integer milliseconds) and a priority queue of scheduled actions.
 * Nothing here touches real time, React, or the network. All randomness comes from seeded streams.
 *
 * Ordering of simultaneous actions: (time, priority, insertion order). Priorities:
 *   -1 fault start/end, 0 pipeline activity, 1 operator interventions, 2 sampling, 3 end-of-run.
 */
import { makeRng, randRange, type Rng } from "./prng";
import {
  MEASUREMENT_UNITS,
  SERVICE_IDS,
  type EventRecord,
  type EventStatus,
  type ExperimentConfig,
  type FaultConfig,
  type GapReport,
  type Health,
  type Intervention,
  type LogEntry,
  type Measurement,
  type RecoveryRecord,
  type RunStatus,
  type Sample,
  type ServiceId,
  type ServiceSummary,
  type SimulationResult,
  type TimelineEntry,
} from "./types";

/** Illustrative alert rules for fictional demo data. NOT medically validated thresholds. */
export const ALERT_RULES: Record<Measurement, { label: string; breaches: (v: number) => boolean }> = {
  heart_rate: { label: "heart_rate > 120 bpm", breaches: (v) => v > 120 },
  oxygen_saturation: { label: "oxygen_saturation < 90 %", breaches: (v) => v < 90 },
  systolic_bp: { label: "systolic_bp > 160 mmHg", breaches: (v) => v > 160 },
};
const MEASUREMENTS: Measurement[] = ["heart_rate", "oxygen_saturation", "systolic_bp"];
const NORMAL_RANGE: Record<Measurement, [number, number]> = {
  heart_rate: [58, 104],
  oxygen_saturation: [94, 100],
  systolic_bp: [100, 135],
};
const BREACH_RANGE: Record<Measurement, [number, number]> = {
  heart_rate: [125, 165],
  oxygen_saturation: [80, 89],
  systolic_bp: [165, 195],
};
const BREACH_PROBABILITY = 0.15;

export const BASE_CAPACITY_PER_SEC: Record<ServiceId, number> = {
  device: 100,
  ingestion: 40,
  processor: 20,
  rules: 20,
  delivery: 10,
  dashboard: Infinity,
};
const QUEUE_CAPACITY = 1000;
const MAX_RETRIES = 8;
const RETRY_BASE_MS = 1000;
const RETRY_CAP_MS = 8000;
const DUPLICATE_DELAY_MS = 1000;
const RECOVERY_WARMUP_MS = 2000;
const DEGRADED_QUEUE_DEPTH = 25;
const SAMPLE_MS = 1000;

export const NEXT_HOP: Partial<Record<ServiceId, ServiceId>> = {
  device: "ingestion",
  ingestion: "processor",
  processor: "rules",
  rules: "delivery",
  delivery: "dashboard",
};

export function eventIdFor(index: number): string {
  return `evt-${String(index + 1).padStart(5, "0")}`;
}
export const patientIdFor = (dev: number) => `SYN-P${String(dev + 1).padStart(3, "0")}`;
export const deviceIdFor = (dev: number) => `SYN-D${String(dev + 1).padStart(3, "0")}`;

interface Item {
  kind: "reading" | "alert";
  eventId: string;
  copy: number;
  failures: number;
  bypassFaults: boolean;
}

interface ActiveFault {
  ord: number;
  fault: FaultConfig;
  rng: Rng;
}

class Heap<T extends { t: number; prio: number; n: number }> {
  private a: T[] = [];
  get size() {
    return this.a.length;
  }
  peek(): T | undefined {
    return this.a[0];
  }
  clear() {
    this.a = [];
  }
  private lt(x: T, y: T) {
    return x.t !== y.t ? x.t < y.t : x.prio !== y.prio ? x.prio < y.prio : x.n < y.n;
  }
  push(v: T) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.lt(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.lt(a[l], a[m])) m = l;
        if (r < a.length && this.lt(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

interface Action {
  t: number;
  prio: number;
  n: number;
  fn: () => void;
}

class Service {
  health: Health = "healthy";
  queue: Item[] = [];
  held = 0;
  dlq: Item[] = [];
  workerScheduled = false;
  nextFreeMs = 0;
  outageDepth = 0;
  recoverySince: number | null = null;
  warmupUntil = 0;
  received = 0;
  processed = 0;
  failed = 0;
  duplicatesRejected = 0;
  peakDepth = 0;
  seen = new Set<string>();
  latest = new Map<string, number>();
  transitions: ServiceSummary["transitions"] = [];
  recoveries: RecoveryRecord[] = [];
  constructor(public id: ServiceId) {}
  get depth() {
    return this.queue.length + this.held + this.dlq.length;
  }
}

export class Simulation {
  private readonly initial: ExperimentConfig;
  config!: ExperimentConfig;
  status: RunStatus = "idle";

  private nowMs = 0;
  private heap = new Heap<Action>();
  private counter = 0;
  private services!: Record<ServiceId, Service>;
  private records!: EventRecord[];
  private byId!: Map<string, EventRecord>;
  private log!: LogEntry[];
  private timeline!: TimelineEntry[];
  private samples!: Sample[];
  private activeFaults!: ActiveFault[];
  private faultOrd = 0;
  private genRng!: Rng;
  private counters!: SimulationResult["counters"];
  private gapTracker!: Map<number, { maxSeq: number; open: Set<number> }>;
  private reconGaps: string[] = [];
  private lastSampleCounts = { n: 0, sum: 0 };
  private latencyAcc = { n: 0, sum: 0 };

  constructor(config: ExperimentConfig) {
    this.initial = structuredClone(config);
    this.init();
  }

  private init() {
    this.config = structuredClone(this.initial);
    this.status = "idle";
    this.nowMs = 0;
    this.heap = new Heap<Action>();
    this.counter = 0;
    this.services = Object.fromEntries(SERVICE_IDS.map((id) => [id, new Service(id)])) as Record<ServiceId, Service>;
    this.records = [];
    this.byId = new Map();
    this.log = [];
    this.timeline = [];
    this.samples = [];
    this.activeFaults = [];
    this.faultOrd = 0;
    this.genRng = makeRng(this.config.seed, "generator");
    this.counters = {
      duplicatesInjected: 0,
      duplicatesRejected: 0,
      duplicatesAccepted: 0,
      duplicateAlertsDelivered: 0,
      packetsDropped: 0,
      staleOverwrites: 0,
      lateArrivals: 0,
      staleFlagged: 0,
    };
    this.gapTracker = new Map();
    this.reconGaps = [];
    this.latencyAcc = { n: 0, sum: 0 };
  }

  // ---------------------------------------------------------------- lifecycle controls

  get nowSec(): number {
    return this.nowMs / 1000;
  }

  start(): void {
    if (this.status !== "idle") return;
    this.status = "running";
    this.note("run_started", `Experiment "${this.config.name}" started (seed ${this.config.seed}, ${this.config.mode} mode).`);
    const cfg = this.config;
    this.at(0, 0, () => this.generate(0));
    cfg.faults.forEach((f) => {
      const startMs = ms(f.startSec);
      this.at(startMs, -1, () => this.startFault(f));
    });
    cfg.interventions.forEach((iv) => this.at(ms(iv.atSec), 1, () => this.applyIntervention(iv)));
    this.sample();
    for (let t = SAMPLE_MS; t <= ms(cfg.durationSec); t += SAMPLE_MS) this.at(t, 2, () => this.sample());
    this.at(ms(cfg.durationSec), 3, () => this.complete());
  }

  pause(): void {
    if (this.status === "running") this.status = "paused";
  }

  resume(): void {
    if (this.status === "paused") this.status = "running";
  }

  /** Stops the run for good. No further events are processed. */
  stop(): void {
    if (this.status !== "running" && this.status !== "paused") return;
    this.config.interventions.push({ atSec: this.nowSec, type: "stop" });
    this.haltStop();
  }

  private haltStop() {
    this.status = "stopped";
    this.heap.clear();
    this.finalizeGaps();
    this.note("run_stopped", `Run stopped by operator at ${fmt(this.nowSec)}s; remaining queued events were left unprocessed.`);
  }

  /** Returns the simulation to its initial state (same config, no interventions beyond those supplied at creation). */
  reset(): void {
    this.init();
  }

  /** Reset and start again with the same seed and configuration. */
  replay(): void {
    this.reset();
    this.start();
  }

  /** Advance the virtual clock to `targetSec`, processing all scheduled actions up to and including that time. */
  advanceTo(targetSec: number): void {
    if (this.status !== "running") return;
    const target = Math.min(ms(targetSec), ms(this.config.durationSec));
    for (;;) {
      const top = this.heap.peek();
      if (!top || top.t > target) break;
      this.heap.pop();
      this.nowMs = top.t;
      top.fn();
      if (this.status !== "running") return;
    }
    this.nowMs = Math.max(this.nowMs, target);
  }

  runToEnd(): SimulationResult {
    if (this.status === "idle") this.start();
    this.advanceTo(this.config.durationSec);
    return this.getResult();
  }

  /** Operator: restore a service made unavailable by an outage fault. */
  recoverService(service: ServiceId): void {
    if (this.status !== "running" && this.status !== "paused") return;
    const iv: Intervention = { atSec: this.nowSec, type: "recover", service };
    this.config.interventions.push(iv);
    this.applyIntervention(iv);
  }

  /** Operator: inject a fault starting now. */
  injectFault(fault: FaultConfig): void {
    if (this.status !== "running" && this.status !== "paused") return;
    const f = { ...fault, startSec: this.nowSec };
    const iv: Intervention = { atSec: this.nowSec, type: "inject", fault: f };
    this.config.interventions.push(iv);
    this.applyIntervention(iv);
  }

  private applyIntervention(iv: Intervention) {
    if (iv.type === "stop") return this.haltStop();
    if (iv.type === "recover") {
      this.note("intervention", `Operator requested manual recovery of ${iv.service}.`, iv.service);
      const outages = this.activeFaults.filter((a) => a.fault.type === "outage" && a.fault.target === iv.service);
      if (!outages.length) return;
      this.activeFaults = this.activeFaults.filter((a) => !outages.includes(a));
      outages.forEach((o) => this.note("fault_ended", `Outage on ${iv.service} ended by manual recovery.`, iv.service));
      this.restore(this.services[iv.service], "manual");
      return;
    }
    this.note("intervention", `Operator injected ${iv.fault.type} fault on ${iv.fault.target}.`, iv.fault.target);
    this.startFault(iv.fault);
  }

  // ---------------------------------------------------------------- scheduler helpers

  private at(t: number, prio: number, fn: () => void) {
    this.heap.push({ t, prio, n: this.counter++, fn });
  }
  private after(delayMs: number, fn: () => void, prio = 0) {
    this.at(this.nowMs + delayMs, prio, fn);
  }

  private note(kind: TimelineEntry["kind"], detail: string, service?: ServiceId) {
    this.timeline.push({ t: this.nowSec, kind, detail, service });
  }

  // ---------------------------------------------------------------- generation

  private generate(i: number) {
    const cfg = this.config;
    const dev = i % cfg.patientCount;
    const measurement = MEASUREMENTS[dev % MEASUREMENTS.length];
    const breach = this.genRng() < BREACH_PROBABILITY;
    const [lo, hi] = (breach ? BREACH_RANGE : NORMAL_RANGE)[measurement];
    const value = Math.round(randRange(this.genRng, lo, hi));
    const rec: EventRecord = {
      eventId: eventIdFor(i),
      patientId: patientIdFor(dev),
      deviceId: deviceIdFor(dev),
      seq: Math.floor(i / cfg.patientCount) + 1,
      measurement,
      value,
      unit: MEASUREMENT_UNITS[measurement],
      eventTime: this.nowSec,
      arrivalTime: null,
      status: "generated",
      expectedAlert: ALERT_RULES[measurement].breaches(value),
      processedAt: null,
      alertGeneratedAt: null,
      deliveredAt: null,
      lossReason: null,
      lossStage: null,
      duplicateCopies: 0,
      lateArrival: false,
      staleOverwrite: false,
      staleFlagged: false,
      deadLettered: false,
      retries: 0,
      delayedBySec: 0,
      faultTags: [],
      transitions: [],
    };
    this.records.push(rec);
    this.byId.set(rec.eventId, rec);
    const item: Item = { kind: "reading", eventId: rec.eventId, copy: 0, failures: 0, bypassFaults: false };
    this.emit(item, "device", "generated", "generated", `Synthetic ${measurement} reading ${value} ${rec.unit} generated by ${rec.deviceId} (seq ${rec.seq}).`);
    this.arrive(item, "device");
    if (i + 1 < cfg.eventCount) this.at(ms((i + 1) * cfg.intervalSec), 0, () => this.generate(i + 1));
  }

  // ---------------------------------------------------------------- logging

  private shouldUpdate(rec: EventRecord, item: Item, status: EventStatus): boolean {
    if (status === "rejected_duplicate") return false;
    if (item.copy > 0) return rec.status === "dropped" || rec.status === "failed";
    if ((status === "dropped" || status === "failed") && rec.status === "delivered") return false;
    return rec.status !== "delivered" || status === "delivered";
  }

  private emit(item: Item, component: ServiceId, type: string, status: EventStatus, explanation: string) {
    const rec = this.byId.get(item.eventId)!;
    this.log.push({ t: this.nowSec, n: this.log.length, eventId: rec.eventId, copy: item.copy, component, type, status, explanation });
    rec.transitions.push({ t: this.nowSec, status, component, copy: item.copy, reason: explanation });
    if (this.shouldUpdate(rec, item, status)) rec.status = status;
  }

  /** A log line that does not change the event's lifecycle status. */
  private trace(item: Item, component: ServiceId, type: string, explanation: string) {
    const rec = this.byId.get(item.eventId)!;
    this.log.push({ t: this.nowSec, n: this.log.length, eventId: rec.eventId, copy: item.copy, component, type, status: rec.status, explanation });
  }

  // ---------------------------------------------------------------- hops and faults

  private send(item: Item, from: ServiceId, to: ServiceId) {
    const rec = this.byId.get(item.eventId)!;
    let delayMs = 0;
    let duplicate = false;
    if (!item.bypassFaults) {
      for (const a of this.activeFaults) {
        const f = a.fault;
        if (f.target !== to || f.type === "outage") continue;
        if (f.type === "packet_loss") {
          if (a.rng() < f.intensity) {
            this.counters.packetsDropped++;
            this.drop(item, to, "packet_loss_injected", `Packet loss injected on the link into ${to}; event never arrived.`);
            return;
          }
        } else if (f.type === "latency") {
          delayMs += ms(f.delaySec);
          this.tag(rec, `latency@${to}`);
        } else if (f.type === "out_of_order") {
          if (a.rng() < f.intensity) {
            delayMs += ms(f.delaySec);
            this.tag(rec, `out_of_order@${to}`);
          }
        } else if (f.type === "duplicate") {
          if (a.rng() < f.intensity) duplicate = true;
        }
      }
    }
    if (duplicate) {
      rec.duplicateCopies++;
      this.counters.duplicatesInjected++;
      this.tag(rec, `duplicate@${to}`);
      const copy: Item = { ...item, copy: rec.duplicateCopies, failures: 0, bypassFaults: true };
      this.trace(copy, from, "duplicate_injected", `Duplicate delivery injected: copy ${copy.copy} of ${rec.eventId} replayed to ${to} with the same event ID.`);
      this.after(delayMs + DUPLICATE_DELAY_MS, () => this.arrive(copy, to));
    }
    const leaving = from === "device" && item.kind === "reading";
    if (delayMs > 0) {
      rec.delayedBySec += delayMs / 1000;
      this.emit(item, from, "delayed", "delayed", `Delivery into ${to} delayed by ${fmt(delayMs / 1000)}s (injected fault).`);
      this.after(delayMs, () => this.arrive(item, to));
    } else {
      if (leaving) this.emit(item, from, "in_transit", "in_transit", `Sent from ${from} to ${to}.`);
      this.arrive(item, to);
    }
  }

  private tag(rec: EventRecord, tag: string) {
    if (!rec.faultTags.includes(tag)) rec.faultTags.push(tag);
  }

  private drop(item: Item, stage: ServiceId, reason: string, explanation: string) {
    const rec = this.byId.get(item.eventId)!;
    if (item.copy === 0 && rec.lossReason === null) {
      rec.lossReason = reason;
      rec.lossStage = stage;
    }
    this.services[stage].failed++;
    this.emit(item, stage, "dropped", "dropped", explanation);
  }

  private arrive(item: Item, to: ServiceId) {
    const svc = this.services[to];
    const rec = this.byId.get(item.eventId)!;
    const resilient = this.config.mode === "resilient";
    if (svc.outageDepth > 0) {
      if (!resilient) {
        this.drop(item, to, "target_unavailable", `${to} is unavailable and the sender has no retry or buffer (faulty mode); event dropped.`);
        return;
      }
      item.failures++;
      if (item.failures > MAX_RETRIES) {
        svc.dlq.push(item);
        svc.peakDepth = Math.max(svc.peakDepth, svc.depth);
        if (item.copy === 0) {
          rec.lossReason = "retries_exhausted";
          rec.lossStage = to;
          rec.deadLettered = true;
        }
        svc.failed++;
        this.emit(item, to, "dead_lettered", "failed", `Retries exhausted (${MAX_RETRIES}) while ${to} was unavailable; moved to dead-letter queue for redrive on recovery.`);
        return;
      }
      const backoff = Math.min(RETRY_BASE_MS * 2 ** (item.failures - 1), RETRY_CAP_MS);
      svc.held++;
      svc.peakDepth = Math.max(svc.peakDepth, svc.depth);
      if (item.copy === 0) rec.retries++;
      this.emit(item, to, "retry_scheduled", "queued", `${to} unavailable; retry ${item.failures}/${MAX_RETRIES} in ${fmt(backoff / 1000)}s (exponential backoff).`);
      this.after(backoff, () => {
        svc.held--;
        this.arrive(item, to);
        this.refresh(svc);
      });
      return;
    }
    if (svc.queue.length >= QUEUE_CAPACITY) {
      this.drop(item, to, "queue_overflow", `${to} inbound queue is full (${QUEUE_CAPACITY}); event dropped.`);
      return;
    }
    svc.received++;
    svc.queue.push(item);
    svc.peakDepth = Math.max(svc.peakDepth, svc.depth);
    if (to === "ingestion") {
      if (item.copy === 0 || rec.arrivalTime === null) rec.arrivalTime = rec.arrivalTime ?? this.nowSec;
      this.emit(item, to, "received", "received", `Ingestion API accepted ${rec.eventId}.`);
    } else if (to === "processor") {
      this.emit(item, to, "queued", "queued", `Queued for the Readings Processor (depth ${svc.queue.length}).`);
    }
    this.refresh(svc);
    this.kick(svc);
  }

  // ---------------------------------------------------------------- workers

  private capacity(svc: Service): number {
    const base = BASE_CAPACITY_PER_SEC[svc.id];
    if (svc.id === "dashboard") return Infinity;
    return svc.recoverySince !== null ? this.config.drainCapacityPerSec : base;
  }

  private kick(svc: Service) {
    if (svc.workerScheduled || svc.outageDepth > 0 || svc.queue.length === 0) return;
    svc.workerScheduled = true;
    this.at(Math.max(this.nowMs, svc.nextFreeMs), 0, () => this.work(svc));
  }

  private work(svc: Service) {
    svc.workerScheduled = false;
    if (svc.outageDepth > 0) return;
    const item = svc.queue.shift();
    if (!item) return;
    const cap = this.capacity(svc);
    svc.nextFreeMs = this.nowMs + (cap === Infinity ? 0 : Math.round(1000 / cap));
    this.process(svc, item);
    this.refresh(svc);
    this.kick(svc);
  }

  private process(svc: Service, item: Item) {
    const rec = this.byId.get(item.eventId)!;
    const resilient = this.config.mode === "resilient";
    const key = `${item.kind}:${item.eventId}`;
    const isIdempotent = svc.id === "processor" || svc.id === "rules" || svc.id === "delivery" || svc.id === "dashboard";
    if (resilient && isIdempotent) {
      if (svc.seen.has(key)) return this.rejectDuplicate(svc, item, `Duplicate rejected: ${rec.eventId} already handled by ${svc.id} (idempotent by event ID).`);
      svc.seen.add(key);
    }
    switch (svc.id) {
      case "device":
        svc.processed++;
        return this.send(item, "device", "ingestion");
      case "ingestion":
        svc.processed++;
        if (resilient && item.copy === 0) this.trackSequence(rec);
        return this.send(item, "ingestion", "processor");
      case "processor": {
        svc.processed++;
        const first = rec.processedAt === null;
        if (!first) {
          this.counters.duplicatesAccepted++;
          this.trace(item, "processor", "duplicate_accepted", `Faulty mode: ${rec.eventId} processed again (no idempotency check).`);
        } else {
          rec.processedAt = this.nowSec;
          rec.lossReason = null;
          this.latencyAcc.n++;
          this.latencyAcc.sum += this.nowSec - rec.eventTime;
          this.orderingPolicy(svc, rec, `${rec.deviceId}:${rec.measurement}`, "reading");
        }
        const age = this.nowSec - rec.eventTime;
        if (resilient && first && age > this.config.staleThresholdSec) this.flagStale(item, rec, "processor", age);
        this.emit(item, "processor", "processed", "processed", `Reading processed (event-to-processing latency ${fmt(age)}s).`);
        return this.send(item, "processor", "rules");
      }
      case "rules": {
        svc.processed++;
        if (!ALERT_RULES[rec.measurement].breaches(rec.value)) return;
        if (rec.alertGeneratedAt === null) rec.alertGeneratedAt = this.nowSec;
        this.emit(item, "rules", "alert_generated", "alert_generated", `Rule fired: ${ALERT_RULES[rec.measurement].label} (value ${rec.value}).`);
        return this.send({ ...item, kind: "alert", failures: 0 }, "rules", "delivery");
      }
      case "delivery":
        svc.processed++;
        this.trace(item, "delivery", "dispatch", `Alert for ${rec.eventId} dispatched to clinician dashboard.`);
        return this.send({ ...item, failures: 0 }, "delivery", "dashboard");
      case "dashboard": {
        svc.processed++;
        const first = rec.deliveredAt === null;
        if (first) {
          rec.deliveredAt = this.nowSec;
          rec.lossReason = null;
          this.orderingPolicy(svc, rec, `${rec.patientId}:${rec.measurement}`, "alert");
        } else {
          this.counters.duplicateAlertsDelivered++;
          this.trace(item, "dashboard", "duplicate_alert_delivered", `Faulty mode: duplicate alert for ${rec.eventId} shown to clinician again.`);
        }
        const age = this.nowSec - rec.eventTime;
        if (resilient && first && age > this.config.staleThresholdSec) this.flagStale(item, rec, "dashboard", age);
        this.emit(item, "dashboard", "delivered", "delivered", `Alert delivered to clinician dashboard (event-to-delivery latency ${fmt(age)}s${rec.staleFlagged ? ", flagged stale" : ""}).`);
        return;
      }
    }
  }

  private flagStale(item: Item, rec: EventRecord, where: ServiceId, age: number) {
    if (rec.staleFlagged) return;
    rec.staleFlagged = true;
    this.counters.staleFlagged++;
    this.trace(item, where, "stale_data_flagged", `Data is ${fmt(age)}s old (threshold ${this.config.staleThresholdSec}s); flagged stale for clinicians.`);
  }

  /** Out-of-order policy. Resilient: keep newest, never overwrite with older. Faulty: last write wins. */
  private orderingPolicy(svc: Service, rec: EventRecord, key: string, what: "reading" | "alert") {
    const prev = svc.latest.get(key);
    const item: Item = { kind: rec.expectedAlert ? "alert" : "reading", eventId: rec.eventId, copy: 0, failures: 0, bypassFaults: true };
    if (prev !== undefined && rec.eventTime < prev) {
      if (this.config.mode === "resilient") {
        rec.lateArrival = true;
        this.counters.lateArrivals++;
        this.trace(item, svc.id, "late_arrival", `Older ${what} (event time ${fmt(rec.eventTime)}s) arrived after newer data (${fmt(prev)}s); current value preserved, event time kept.`);
      } else {
        rec.staleOverwrite = true;
        this.counters.staleOverwrites++;
        svc.latest.set(key, rec.eventTime);
        this.trace(item, svc.id, "stale_overwrite", `Faulty mode: older ${what} (event time ${fmt(rec.eventTime)}s) overwrote newer data (${fmt(prev)}s).`);
      }
    } else {
      svc.latest.set(key, rec.eventTime);
    }
  }

  private rejectDuplicate(svc: Service, item: Item, explanation: string) {
    const rec = this.byId.get(item.eventId)!;
    svc.duplicatesRejected++;
    this.counters.duplicatesRejected++;
    this.emit(item, svc.id, "duplicate_rejected", "rejected_duplicate", explanation);
    if (item.copy === 0) {
      rec.status = rec.deliveredAt !== null ? "delivered" : rec.alertGeneratedAt !== null ? "alert_generated" : rec.processedAt !== null ? "processed" : rec.status;
    }
  }

  private trackSequence(rec: EventRecord) {
    const devIdx = Number(rec.deviceId.slice(5)) - 1;
    let t = this.gapTracker.get(devIdx);
    if (!t) {
      t = { maxSeq: 0, open: new Set() };
      this.gapTracker.set(devIdx, t);
    }
    if (rec.seq > t.maxSeq + 1) {
      const missing: number[] = [];
      for (let s = t.maxSeq + 1; s < rec.seq; s++) {
        t.open.add(s);
        missing.push(s);
      }
      this.note(
        "gap_detected",
        `Sequence gap on ${rec.deviceId}: expected seq ${missing[0]}${missing.length > 1 ? `–${missing[missing.length - 1]}` : ""}, got ${rec.seq}.`,
        "ingestion",
      );
      t.maxSeq = rec.seq;
    } else if (rec.seq > t.maxSeq) {
      t.maxSeq = rec.seq;
    } else if (t.open.delete(rec.seq)) {
      this.note("gap_detected", `Gap filled: ${rec.deviceId} seq ${rec.seq} arrived late (out of order).`, "ingestion");
    }
  }

  // ---------------------------------------------------------------- faults, health, recovery

  private startFault(fault: FaultConfig) {
    const ord = this.faultOrd++;
    this.activeFaults.push({ ord, fault, rng: makeRng(this.config.seed, `fault:${ord}`) });
    const svc = this.services[fault.target];
    this.note("fault_started", describeFault(fault), fault.target);
    if (fault.type === "outage") {
      svc.outageDepth++;
      svc.recoverySince = null;
      if (this.config.mode === "faulty") {
        const lost = svc.queue.splice(0);
        lost.forEach((it) => this.drop(it, svc.id, "queue_lost_on_crash", `${svc.id} crashed; its in-memory queue was lost (faulty mode has no durable queue).`));
      }
    }
    this.refresh(svc);
    // Scheduled and live-injected faults share this single end timer.
    if (fault.durationSec !== null) this.at(this.nowMs + ms(fault.durationSec), -1, () => this.endFault(ord));
  }

  private endFault(ord: number) {
    const idx = this.activeFaults.findIndex((a) => a.ord === ord);
    if (idx < 0) return;
    const [a] = this.activeFaults.splice(idx, 1);
    const svc = this.services[a.fault.target];
    this.note("fault_ended", `${a.fault.type} fault on ${a.fault.target} ended.`, a.fault.target);
    if (a.fault.type === "outage") this.restore(svc, "automatic");
    else this.refresh(svc);
  }

  private restore(svc: Service, trigger: "automatic" | "manual") {
    svc.outageDepth = Math.max(0, this.activeFaults.filter((a) => a.fault.type === "outage" && a.fault.target === svc.id).length);
    if (svc.outageDepth > 0) return;
    svc.recoverySince = this.nowMs;
    svc.warmupUntil = this.nowMs + RECOVERY_WARMUP_MS;
    svc.recoveries.push({ service: svc.id, initiatedAt: this.nowSec, completedAt: null, trigger });
    this.note("recovery_initiated", `${svc.id} restored (${trigger}); draining backlog at ${this.config.drainCapacityPerSec}/s.`, svc.id);
    const redrive = svc.dlq.splice(0);
    redrive.forEach((it) => {
      it.failures = 0;
      this.trace(it, svc.id, "redriven", `Dead-lettered event redriven to ${svc.id} after recovery.`);
      this.arrive(it, svc.id);
    });
    this.refresh(svc);
    this.at(svc.warmupUntil, 0, () => this.refresh(svc));
    this.kick(svc);
  }

  private refresh(svc: Service) {
    let next: Health;
    let reason: string;
    const degraded = () =>
      this.activeFaults.some((a) => a.fault.type === "latency" && a.fault.target === svc.id) || svc.queue.length >= DEGRADED_QUEUE_DEPTH;
    if (svc.outageDepth > 0) {
      next = "unavailable";
      reason = "outage fault active";
    } else if (svc.recoverySince !== null) {
      if (this.nowMs >= svc.warmupUntil && svc.queue.length === 0 && svc.held === 0 && svc.dlq.length === 0) {
        svc.recoverySince = null;
        const open = [...svc.recoveries].reverse().find((r) => r.completedAt === null);
        if (open) open.completedAt = this.nowSec;
        this.note("recovery_completed", `${svc.id} recovered: backlog drained and service healthy.`, svc.id);
        next = degraded() ? "degraded" : "healthy";
        reason = "recovery condition met (queue drained)";
      } else {
        next = "recovering";
        reason = "draining backlog after restore";
      }
    } else if (degraded()) {
      next = "degraded";
      reason = svc.queue.length >= DEGRADED_QUEUE_DEPTH ? `queue depth ≥ ${DEGRADED_QUEUE_DEPTH}` : "latency fault active";
    } else {
      next = "healthy";
      reason = "no active faults, queue within limits";
    }
    if (next !== svc.health) {
      svc.transitions.push({ t: this.nowSec, from: svc.health, to: next, reason });
      this.note("service_state", `${svc.id}: ${svc.health} → ${next} (${reason}).`, svc.id);
      svc.health = next;
    }
  }

  // ---------------------------------------------------------------- sampling and completion

  private sample() {
    const depth = {} as Record<ServiceId, number>;
    const health = {} as Record<ServiceId, Health>;
    let total = 0;
    for (const id of SERVICE_IDS) {
      depth[id] = this.services[id].depth;
      health[id] = this.services[id].health;
      total += depth[id];
    }
    const processed = this.records.filter((r) => r.processedAt !== null).length;
    const delivered = this.records.filter((r) => r.deliveredAt !== null).length;
    const failed = this.records.filter((r) => r.status === "dropped" || r.status === "failed").length;
    this.samples.push({
      t: this.nowSec,
      depth,
      totalDepth: total,
      health,
      generated: this.records.length,
      processed,
      delivered,
      failed,
      latencySec: this.latencyAcc.n ? this.latencyAcc.sum / this.latencyAcc.n : null,
    });
    this.latencyAcc = { n: 0, sum: 0 };
  }

  private complete() {
    this.status = "completed";
    this.nowMs = ms(this.config.durationSec);
    this.finalizeGaps();
    this.note("run_completed", `Observation window ended at ${fmt(this.nowSec)}s.`);
  }

  private finalizeGaps() {
    if (this.config.mode !== "resilient") return;
    const received = new Set(this.records.filter((r) => r.arrivalTime !== null).map((r) => r.eventId));
    const detected = new Set(this.detectedBySequence());
    this.reconGaps = this.records
      .filter((r) => !received.has(r.eventId) && !detected.has(r.eventId))
      .map((r) => r.eventId);
    for (let i = this.records.length; i < this.config.eventCount; i++) this.reconGaps.push(eventIdFor(i));
  }

  private detectedBySequence(): string[] {
    const out: string[] = [];
    for (const [dev, t] of this.gapTracker) for (const seq of t.open) out.push(eventIdFor((seq - 1) * this.config.patientCount + dev));
    return out.sort();
  }

  // ---------------------------------------------------------------- results

  getResult(): SimulationResult {
    const services = {} as Record<ServiceId, ServiceSummary>;
    for (const id of SERVICE_IDS) {
      const s = this.services[id];
      services[id] = {
        id,
        health: s.health,
        received: s.received,
        processed: s.processed,
        failed: s.failed,
        duplicatesRejected: s.duplicatesRejected,
        queueDepth: s.depth,
        peakQueueDepth: s.peakDepth,
        capacityPerSec: BASE_CAPACITY_PER_SEC[id],
        transitions: s.transitions,
        recoveries: s.recoveries,
        activeFaults: this.activeFaults.filter((a) => a.fault.target === id).map((a) => a.fault),
      };
    }
    const gaps: GapReport = {
      detectedBySequence: this.config.mode === "resilient" ? this.detectedBySequence() : [],
      detectedByReconciliation: this.reconGaps,
    };
    return {
      config: this.config,
      status: this.status,
      nowSec: this.nowSec,
      events: this.records,
      log: this.log,
      timeline: this.timeline,
      // Copied: chart libraries (immer) deep-freeze the arrays they receive, which must never be the live arrays.
      samples: this.samples.slice(),
      services,
      gaps,
      counters: { ...this.counters },
    };
  }
}

function ms(sec: number): number {
  return Math.round(sec * 1000);
}
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function describeFault(f: FaultConfig): string {
  switch (f.type) {
    case "latency":
      return `Latency fault: +${f.delaySec}s on ${f.target}${f.durationSec ? ` for ${f.durationSec}s` : ""}.`;
    case "duplicate":
      return `Duplicate delivery fault: ${Math.round(f.intensity * 100)}% of events into ${f.target} replayed with the same event ID.`;
    case "packet_loss":
      return `Packet loss fault: ${Math.round(f.intensity * 100)}% of events into ${f.target} dropped.`;
    case "out_of_order":
      return `Out-of-order fault: ${Math.round(f.intensity * 100)}% of events into ${f.target} held ${f.delaySec}s so newer readings overtake them.`;
    case "outage":
      return `Outage fault: ${f.target} unavailable${f.durationSec ? ` for ${f.durationSec}s` : " until manually recovered"}.`;
  }
}
