import { describe, expect, it } from "vitest";
import { computeMetrics, evaluate, validateConfig, resolvePipeline } from "@/engine";
import { cfg, makeFault, run } from "./helpers";

describe("bring-your-own pipeline profile", () => {
  it("defaults are unchanged when no pipeline is given", () => {
    const r = resolvePipeline({});
    expect(r.capacity.processor).toBe(20);
    expect(r.maxRetries).toBe(8);
    expect(r.queueCapacity).toBe(1000);
    expect(r.rules.heart_rate.breaches(121)).toBe(true);
  });

  it("a slower stage builds a queue and raises latency, and shows in service state", () => {
    const base = computeMetrics(run(cfg({ intervalSec: 0.2, eventCount: 150, durationSec: 120 })));
    const slow = run(cfg({ intervalSec: 0.2, eventCount: 150, durationSec: 120, pipeline: { capacities: { processor: 2 } } }));
    const m = computeMetrics(slow);
    expect(m.readingLatency.maxSec as number).toBeGreaterThan((base.readingLatency.maxSec as number) + 5);
    expect(slow.services.processor.capacityPerSec).toBe(2);
    expect(slow.services.processor.peakQueueDepth).toBeGreaterThan(25);
    expect(slow.services.processor.transitions.some((t) => t.to === "degraded")).toBe(true);
  });

  it("the retry policy controls when events are dead-lettered", () => {
    const outage = [makeFault({ type: "outage", target: "delivery", startSec: 20, durationSec: 40 })];
    const none = run(cfg({ pipeline: { retry: { maxRetries: 0, baseSec: 1, capSec: 1 } } }, outage));
    const generous = run(cfg({ pipeline: { retry: { maxRetries: 50, baseSec: 2, capSec: 10 } } }, outage));
    const dlq = (r: typeof none) => r.events.filter((e) => e.deadLettered).length;
    expect(dlq(none)).toBeGreaterThan(0);
    expect(dlq(generous)).toBe(0);
    // both still deliver everything in resilient mode: retries differ, outcomes do not
    expect(computeMetrics(none).alertsDelivered).toBe(computeMetrics(none).alertsExpected);
    expect(computeMetrics(generous).alertsDelivered).toBe(computeMetrics(generous).alertsExpected);
  });

  it("alert rules are configurable and drive expected alerts", () => {
    const def = computeMetrics(run(cfg()));
    const strict = computeMetrics(run(cfg({ pipeline: { alertRules: { heart_rate: { op: ">", threshold: 500 }, oxygen_saturation: { op: "<", threshold: 0 }, systolic_bp: { op: ">", threshold: 500 } } } })));
    expect(def.alertsExpected).toBeGreaterThan(0);
    expect(strict.alertsExpected).toBe(0);
    const loose = computeMetrics(run(cfg({ pipeline: { alertRules: { heart_rate: { op: ">", threshold: 0 } } } })));
    expect(loose.alertsExpected).toBeGreaterThan(def.alertsExpected);
  });

  it("a tiny queue limit drops overflow with a recorded reason", () => {
    const r = run(cfg({ intervalSec: 0.1, eventCount: 150, durationSec: 60, pipeline: { queueCapacity: 3, capacities: { processor: 1 } } }));
    const dropped = r.events.filter((e) => e.lossReason === "queue_overflow");
    expect(dropped.length).toBeGreaterThan(0);
    expect(evaluate(r).metrics.readingLoss.byReason["queue_overflow"]).toBeGreaterThan(0);
  });

  it("is validated with actionable errors", () => {
    expect(validateConfig(cfg({ pipeline: { capacities: { processor: 0 } } })).ok).toBe(false);
    expect(validateConfig(cfg({ pipeline: { retry: { maxRetries: -1, baseSec: 1, capSec: 1 } } })).ok).toBe(false);
    expect(validateConfig({ ...cfg(), pipeline: { nonsense: true } }).ok).toBe(false);
    expect(validateConfig(cfg({ pipeline: { capacities: { processor: 5 }, queueCapacity: 50 } })).ok).toBe(true);
  });

  it("same pipeline + seed is reproducible", () => {
    const c = cfg({ pipeline: { capacities: { processor: 3, delivery: 4 } } }, [makeFault({ type: "latency", target: "rules", startSec: 5, durationSec: 20, delaySec: 4, intensity: 1 })]);
    expect(JSON.stringify(run(c).events)).toBe(JSON.stringify(run(c).events));
  });
});
