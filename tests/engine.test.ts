import { describe, expect, it } from "vitest";
import { computeMetrics, latencyStats, quantile, ratio, Simulation, validateConfig, scenarioConfig, evaluateAssertions, evaluate } from "@/engine";
import { makeRng } from "@/engine/prng";
import { cfg, makeFault, run } from "./helpers";

describe("seeded generation", () => {
  it("PRNG streams are reproducible and independent by label", () => {
    const a = makeRng(7, "x");
    const b = makeRng(7, "x");
    const c = makeRng(7, "y");
    const sa = [a(), a(), a()];
    expect(sa).toEqual([b(), b(), b()]);
    expect(sa).not.toEqual([c(), c(), c()]);
  });
  it("same seed gives identical readings; different seed differs", () => {
    const one = run(cfg({ seed: 5 })).events.map((e) => [e.value, e.measurement]);
    const two = run(cfg({ seed: 5 })).events.map((e) => [e.value, e.measurement]);
    const three = run(cfg({ seed: 6 })).events.map((e) => [e.value, e.measurement]);
    expect(one).toEqual(two);
    expect(one).not.toEqual(three);
  });
  it("uses fictional IDs and carries required fields", () => {
    const e = run(cfg()).events[0];
    expect(e.patientId).toMatch(/^SYN-P\d{3}$/);
    expect(e.deviceId).toMatch(/^SYN-D\d{3}$/);
    expect(e.eventId).toMatch(/^evt-\d{5}$/);
    expect(e.unit).toBeTruthy();
  });
});

describe("event lifecycle", () => {
  it("a healthy alerting event passes through every state in order, preserving identity", () => {
    const r = run(cfg());
    const e = r.events.find((x) => x.expectedAlert)!;
    expect(e.transitions.map((t) => t.status)).toEqual(["generated", "in_transit", "received", "queued", "processed", "alert_generated", "delivered"]);
    const times = e.transitions.map((t) => t.t);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    // every lifecycle transition is mirrored in the global log (the log also holds non-status trace lines)
    expect(r.log.filter((l) => l.eventId === e.eventId).length).toBeGreaterThanOrEqual(e.transitions.length);
    expect(e.status).toBe("delivered");
  });
  it("non-breaching readings end as processed", () => {
    const e = run(cfg()).events.find((x) => !x.expectedAlert)!;
    expect(e.status).toBe("processed");
  });
  it("every drop carries a reason", () => {
    const r = run(cfg({}, [makeFault({ type: "packet_loss", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.3 })]));
    const dropped = r.events.filter((e) => e.status === "dropped");
    expect(dropped.length).toBeGreaterThan(0);
    for (const e of dropped) {
      expect(e.lossReason).toBe("packet_loss_injected");
      expect(e.transitions.at(-1)!.reason).toMatch(/packet loss/i);
    }
  });
});

describe("faults", () => {
  it("latency delays affected events by at least the configured seconds and marks the service degraded", () => {
    const r = run(cfg({}, [makeFault({ type: "latency", target: "processor", startSec: 20, durationSec: 30, delaySec: 15, intensity: 1 })]));
    const hit = r.events.filter((e) => e.faultTags.includes("latency@processor"));
    expect(hit.length).toBe(30);
    for (const e of hit) expect((e.processedAt as number) - e.eventTime).toBeGreaterThanOrEqual(15);
    expect(r.services.processor.transitions.some((t) => t.to === "degraded")).toBe(true);
    expect(r.services.processor.health).toBe("healthy");
  });
  it("resilient mode rejects duplicates; faulty mode accepts and double-alerts", () => {
    const f = [makeFault({ type: "duplicate", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.5 })];
    const good = run(cfg({ mode: "resilient" }, f));
    const bad = run(cfg({ mode: "faulty" }, f));
    expect(good.counters.duplicatesInjected).toBeGreaterThan(10);
    expect(good.counters.duplicatesRejected).toBe(good.counters.duplicatesInjected);
    expect(good.counters.duplicatesAccepted).toBe(0);
    expect(good.counters.duplicateAlertsDelivered).toBe(0);
    expect(bad.counters.duplicatesRejected).toBe(0);
    expect(bad.counters.duplicatesAccepted).toBe(bad.counters.duplicatesInjected);
    expect(bad.counters.duplicateAlertsDelivered).toBeGreaterThan(0);
    // unique processing is the same either way; rejected duplicates are not drops
    expect(computeMetrics(good).readingsProcessed).toBe(120);
    expect(computeMetrics(good).eventsDropped).toBe(0);
  });
  it("packet loss rate tracks intensity deterministically and is classified as intentional", () => {
    const f = [makeFault({ type: "packet_loss", target: "ingestion", startSec: 0, durationSec: 190, intensity: 0.25 })];
    const c = cfg({ eventCount: 180 }, f);
    const m1 = computeMetrics(run(c));
    const m2 = computeMetrics(run(c));
    expect(m1.readingLoss).toEqual(m2.readingLoss);
    expect(m1.readingLoss.intentional).toBe(m1.readingLoss.total);
    expect(m1.readingLoss.intentional / 180).toBeGreaterThan(0.15);
    expect(m1.readingLoss.intentional / 180).toBeLessThan(0.35);
    expect(m1.processingSuccessRate.value).toBe(1);
  });
  it("detects sequence gaps via the tracker and by reconciliation, but not in faulty mode", () => {
    const f = [makeFault({ type: "packet_loss", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.2 })];
    const r = run(cfg({ mode: "resilient" }, f));
    const lost = r.events.filter((e) => e.lossReason === "packet_loss_injected").map((e) => e.eventId);
    const known = new Set([...r.gaps.detectedBySequence, ...r.gaps.detectedByReconciliation]);
    expect(lost.length).toBeGreaterThan(0);
    for (const id of lost) expect(known.has(id)).toBe(true);
    expect(r.gaps.detectedBySequence.length).toBeGreaterThan(0);
    const bad = run(cfg({ mode: "faulty" }, f));
    expect(bad.gaps.detectedBySequence).toEqual([]);
  });
  it("out-of-order: resilient keeps event time and never overwrites newer data; faulty overwrites", () => {
    const f = [makeFault({ type: "out_of_order", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.4, delaySec: 8 })];
    const good = run(cfg({ mode: "resilient" }, f));
    const bad = run(cfg({ mode: "faulty" }, f));
    expect(computeMetrics(good).reorderedReadings).toBeGreaterThan(0);
    expect(good.counters.lateArrivals).toBeGreaterThan(0);
    expect(good.counters.staleOverwrites).toBe(0);
    expect(bad.counters.staleOverwrites).toBeGreaterThan(0);
    const late = good.events.find((e) => e.lateArrival)!;
    expect(late.eventTime).toBeCloseTo((Number(late.eventId.slice(4)) - 1) * 1, 5);
    expect(late.processedAt as number).toBeGreaterThan(late.eventTime);
  });
});

describe("outage, queueing and recovery", () => {
  const outage = [makeFault({ type: "outage", target: "delivery", startSec: 30, durationSec: 40 })];
  it("prevents delivery while unavailable and delivers after recovery (resilient)", () => {
    const r = run(cfg({ mode: "resilient" }, outage));
    const during = r.events.filter((e) => e.deliveredAt !== null && e.deliveredAt >= 30 && e.deliveredAt < 70);
    expect(during).toEqual([]);
    expect(r.services.delivery.transitions.map((t) => t.to)).toEqual(expect.arrayContaining(["unavailable", "recovering", "healthy"]));
    const m = computeMetrics(r);
    expect(m.alertsDelivered).toBe(m.alertsExpected);
    expect(m.peakQueueDepth).toBeGreaterThan(0);
    expect(m.recoveryTimeSec).toBeGreaterThan(0);
    expect(m.finalQueueDepth).toBe(0);
  });
  it("faulty mode drops alerts during an outage with explicit reasons", () => {
    const r = run(cfg({ mode: "faulty" }, outage));
    const m = computeMetrics(r);
    expect(m.alertsDelivered).toBeLessThan(m.alertsExpected);
    expect(m.alertLoss.unexpected).toBeGreaterThan(0);
    expect(Object.keys(m.alertLoss.byReason).every((k) => k !== "")).toBe(true);
  });
  it("does not report recovery until the engine restores service and drains the backlog", () => {
    const sim = new Simulation(cfg({}, [makeFault({ type: "outage", target: "processor", startSec: 10, durationSec: null })]));
    sim.start();
    sim.advanceTo(60);
    let r = sim.getResult();
    expect(r.services.processor.health).toBe("unavailable");
    expect(r.timeline.some((t) => t.kind === "recovery_completed")).toBe(false);
    sim.recoverService("processor");
    r = sim.getResult();
    expect(r.services.processor.health).toBe("recovering");
    expect(r.timeline.some((t) => t.kind === "recovery_completed")).toBe(false);
    sim.advanceTo(200);
    r = sim.getResult();
    expect(r.services.processor.health).toBe("healthy");
    const rec = r.services.processor.recoveries[0];
    expect(rec.trigger).toBe("manual");
    expect(rec.completedAt).toBeGreaterThan(rec.initiatedAt);
  });
  it("a manual outage that is never recovered leaves events accounted for, not lost silently", () => {
    const r = run(cfg({}, [makeFault({ type: "outage", target: "processor", startSec: 10, durationSec: null })]));
    const m = computeMetrics(r);
    expect(r.services.processor.health).toBe("unavailable");
    expect(m.readingLoss.total).toBeGreaterThan(0);
    expect(m.recoveries).toEqual([]);
    expect(m.eventsDeadLettered).toBeGreaterThan(0);
  });
  it("backlog drains at the configured capacity", () => {
    const f = [makeFault({ type: "outage", target: "processor", startSec: 10, durationSec: 20 })];
    const slow = computeMetrics(run(cfg({ drainCapacityPerSec: 2, intervalSec: 0.5, eventCount: 200, durationSec: 300 }, f)));
    const fast = computeMetrics(run(cfg({ drainCapacityPerSec: 15, intervalSec: 0.5, eventCount: 200, durationSec: 300 }, f)));
    expect(slow.recoveryTimeSec as number).toBeGreaterThan(fast.recoveryTimeSec as number);
    expect(slow.readingsProcessed).toBe(200);
    expect(fast.readingsProcessed).toBe(200);
  });
});

describe("run controls", () => {
  const c = cfg({}, [makeFault({ type: "latency", target: "processor", startSec: 5, durationSec: 20, delaySec: 5, intensity: 1 })]);
  it("pause halts progress and resume continues", () => {
    const sim = new Simulation(c);
    sim.start();
    sim.advanceTo(20);
    const before = sim.getResult().events.length;
    sim.pause();
    sim.advanceTo(100);
    expect(sim.getResult().events.length).toBe(before);
    expect(sim.status).toBe("paused");
    sim.resume();
    sim.advanceTo(100);
    expect(sim.getResult().events.length).toBeGreaterThan(before);
  });
  it("stop prevents any further processing and yields an inconclusive evaluation", () => {
    const sim = new Simulation(c);
    sim.start();
    sim.advanceTo(20);
    sim.stop();
    const snap = JSON.stringify(sim.getResult().events);
    sim.advanceTo(200);
    sim.resume();
    sim.advanceTo(200);
    expect(JSON.stringify(sim.getResult().events)).toBe(snap);
    expect(sim.status).toBe("stopped");
    const ev = evaluate(sim.getResult());
    expect(ev.verdict).toBe("inconclusive");
    expect(ev.assertions).toEqual([]);
    expect(ev.metrics.readingLoss.byReason["stopped_before_completion"]).toBeGreaterThan(0);
  });
  it("reset returns to the initial state", () => {
    const sim = new Simulation(c);
    sim.start();
    sim.advanceTo(50);
    sim.reset();
    const r = sim.getResult();
    expect(sim.status).toBe("idle");
    expect(r.events).toEqual([]);
    expect(r.log).toEqual([]);
    expect(r.nowSec).toBe(0);
    expect(r.config.interventions).toEqual([]);
  });
  it("replay reproduces the exact same results (same seed and config)", () => {
    const sim = new Simulation(c);
    sim.start();
    sim.advanceTo(200);
    const first = JSON.stringify(sim.getResult());
    sim.replay();
    sim.advanceTo(200);
    expect(JSON.stringify(sim.getResult())).toBe(first);
  });
  it("step size does not change results", () => {
    const a = new Simulation(c);
    a.start();
    for (let t = 0; t <= 200; t += 0.37) a.advanceTo(t);
    a.advanceTo(200);
    expect(JSON.stringify(a.getResult())).toBe(JSON.stringify(run(c)));
  });
  it("live interventions are recorded and replay deterministically", () => {
    const sim = new Simulation(cfg());
    sim.start();
    sim.advanceTo(25.3);
    sim.injectFault(makeFault({ type: "outage", target: "rules", startSec: 0, durationSec: null }));
    sim.advanceTo(60.1);
    sim.recoverService("rules");
    sim.advanceTo(200);
    const live = sim.getResult();
    expect(live.config.interventions.map((i) => i.type)).toEqual(["inject", "recover"]);
    const replayed = run(live.config);
    expect(JSON.stringify(replayed.events)).toBe(JSON.stringify(live.events));
    expect(replayed.services.rules.recoveries[0].completedAt).toBe(live.services.rules.recoveries[0].completedAt);
  });
});

describe("metrics", () => {
  it("handles zero denominators explicitly", () => {
    const r = ratio(0, 0, "x", "nothing expected");
    expect(r.value).toBeNull();
    expect(r.note).toBe("nothing expected");
    const m = computeMetrics(run(cfg()));
    expect(m.duplicateRejectionRate.value).toBeNull();
    expect(m.duplicateRejectionRate.note).toMatch(/No duplicates/);
    expect(m.recoveryTimeSec).toBeNull();
  });
  it("computes quantiles and withholds p95 for small samples", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    const small = latencyStats([1, 2, 3], "t");
    expect(small.p95Sec).toBeNull();
    expect(small.note).toMatch(/at least 20/);
    const big = latencyStats(Array.from({ length: 100 }, (_, i) => i + 1), "t");
    expect(big.medianSec).toBe(50);
    expect(big.p95Sec).toBe(95);
  });
  it("keeps dropped, rejected duplicate and intentional loss separate", () => {
    const f = [
      makeFault({ type: "duplicate", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.3 }),
      makeFault({ type: "packet_loss", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.1 }),
    ];
    const m = computeMetrics(run(cfg({}, f)));
    expect(m.duplicatesRejected).toBeGreaterThan(0);
    expect(m.eventsDropped).toBe(m.readingLoss.intentional);
    expect(m.outcomes["rejected_duplicate"] ?? 0).toBe(0);
  });
  it("latency stats use event time to processed/delivered time", () => {
    const r = run(cfg());
    const m = computeMetrics(r);
    const manual = r.events.filter((e) => e.processedAt !== null).map((e) => (e.processedAt as number) - e.eventTime);
    expect(m.readingLatency.n).toBe(manual.length);
    expect(m.readingLatency.maxSec).toBeCloseTo(Math.max(...manual), 6);
  });
});

describe("assertions", () => {
  it("fail when behavior is wrong (not hardcoded to pass)", () => {
    const r = run(cfg({ mode: "faulty" }, [makeFault({ type: "duplicate", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.4 })]));
    const m = computeMetrics(r);
    const out = evaluateAssertions(r, m, [
      { id: "a", kind: "duplicates_all_rejected", title: "dups" },
      { id: "b", kind: "all_processed", title: "processed" },
    ]);
    expect(out.find((o) => o.id === "a")!.status).toBe("failed");
    expect(out.find((o) => o.id === "b")!.status).toBe("passed");
  });
  it("marks assertions not applicable when their precondition is absent", () => {
    const r = run(cfg());
    const out = evaluateAssertions(r, computeMetrics(r), [{ id: "a", kind: "recovery_time_max", title: "rt" }]);
    expect(out[0].status).toBe("not_applicable");
  });
});

describe("config validation", () => {
  it("accepts scenario presets", () => {
    expect(validateConfig(scenarioConfig("alert-service-outage")).ok).toBe(true);
  });
  it("rejects impossible combinations with actionable messages", () => {
    const bad = scenarioConfig("alert-service-outage", { eventCount: 500, durationSec: 100 });
    const res = validateConfig(bad);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.issues[0].message).toMatch(/Increase the duration/);
    const outageLate = validateConfig(scenarioConfig("alert-service-outage", { faults: [makeFault({ type: "outage", target: "delivery", startSec: 250, durationSec: 100 })] }));
    expect(outageLate.ok).toBe(false);
    const device = validateConfig(scenarioConfig("packet-loss", { faults: [makeFault({ type: "packet_loss", target: "device" })] }));
    expect(device.ok).toBe(false);
  });
});

describe("result snapshots", () => {
  it("samples in a snapshot are detached from the live engine (UI libraries may freeze them)", () => {
    const sim = new Simulation(cfg());
    sim.start();
    sim.advanceTo(3);
    const snap = sim.getResult();
    Object.freeze(snap.samples);
    expect(() => sim.advanceTo(30)).not.toThrow();
    expect(sim.getResult().samples.length).toBeGreaterThan(snap.samples.length);
  });
});

describe("stored experiments replay", () => {
  it("a live stop is reproduced exactly by replaying the recorded config", () => {
    const sim = new Simulation(cfg({}, [makeFault({ type: "latency", target: "processor", startSec: 5, durationSec: 40, delaySec: 6, intensity: 1 })]));
    sim.start();
    sim.advanceTo(33.3);
    sim.stop();
    const live = sim.getResult();
    const replayed = run(live.config);
    expect(replayed.status).toBe("stopped");
    expect(replayed.nowSec).toBe(live.nowSec);
    expect(JSON.stringify(replayed.events)).toBe(JSON.stringify(live.events));
  });
});
