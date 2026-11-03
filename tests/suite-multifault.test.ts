import { describe, expect, it } from "vitest";
import { assertionsFor, computeMetrics, evaluate, makeFault, runExperiment, runSuite, scenarioConfig, suiteExitCode, validateConfig, SCENARIOS } from "@/engine";
import { cfg, run } from "./helpers";

describe("headless suite (CLI core)", () => {
  it("runs every scenario and exits 0 when all resilient runs pass", () => {
    const rows = runSuite();
    expect(rows).toHaveLength(SCENARIOS.length);
    expect(suiteExitCode(rows)).toBe(0);
  });
  it("faulty-mode reference runs never fail the suite", () => {
    const rows = runSuite({ modes: ["resilient", "faulty"] });
    expect(rows.some((r) => r.mode === "faulty" && r.evaluation.verdict === "failed")).toBe(true);
    expect(suiteExitCode(rows)).toBe(0);
  });
  it("returns a failing exit code when a resilient scenario fails", () => {
    const rows = runSuite({ scenarios: ["healthy-baseline"] });
    rows[0].evaluation.verdict = "failed";
    expect(suiteExitCode(rows)).toBe(1);
  });
  it("seed override changes the config and stays deterministic", () => {
    const a = runSuite({ scenarios: ["packet-loss"], seed: 7 })[0];
    const b = runSuite({ scenarios: ["packet-loss"], seed: 7 })[0];
    expect(a.seed).toBe(7);
    expect(JSON.stringify(a.evaluation.result.events)).toBe(JSON.stringify(b.evaluation.result.events));
  });
});

describe("multiple simultaneous faults", () => {
  const faults = [
    makeFault({ type: "duplicate", target: "ingestion", startSec: 10, durationSec: 100, intensity: 0.3 }),
    makeFault({ type: "outage", target: "delivery", startSec: 40, durationSec: 30 }),
    makeFault({ type: "latency", target: "processor", startSec: 20, durationSec: 20, delaySec: 15, intensity: 1 }),
  ];
  it("validates and applies all faults in one run", () => {
    const c = cfg({}, faults);
    expect(validateConfig(c).ok).toBe(true);
    const r = run(c);
    expect(r.counters.duplicatesInjected).toBeGreaterThan(0);
    expect(r.services.delivery.recoveries.length).toBe(1);
    expect(r.events.some((e) => e.faultTags.includes("latency@processor"))).toBe(true);
  });
  it("resilient mode survives the combination and every fault gets its assertions", () => {
    const c = cfg({}, faults);
    const ids = assertionsFor(c).map((a) => a.kind);
    expect(ids).toEqual(expect.arrayContaining(["duplicates_all_rejected", "no_work_during_outage", "latency_reflects_delay"]));
    const ev = runExperiment(c);
    expect(ev.assertions.filter((a) => a.status === "failed")).toEqual([]);
    expect(ev.verdict).toBe("passed");
  });
  it("faulty mode fails on the combination and is reproducible", () => {
    const c = cfg({ mode: "faulty" }, faults);
    const a = runExperiment(c);
    const b = runExperiment(c);
    expect(a.verdict).toBe("failed");
    expect(JSON.stringify(a.result.events)).toBe(JSON.stringify(b.result.events));
    expect(computeMetrics(a.result).duplicatesAccepted).toBeGreaterThan(0);
  });
  it("two outages on one service need both to end before recovery starts", () => {
    const c = cfg({}, [makeFault({ type: "outage", target: "processor", startSec: 10, durationSec: 20 }), makeFault({ type: "outage", target: "processor", startSec: 20, durationSec: 30 })]);
    const r = run(c);
    expect(r.services.processor.recoveries).toHaveLength(1);
    expect(r.services.processor.recoveries[0].initiatedAt).toBe(50);
    expect(evaluate(r).metrics.finalQueueDepth).toBe(0);
  });
  it("preset scenarios keep their own assertions; edited fault sets get generated ones", () => {
    expect(assertionsFor(scenarioConfig("alert-service-outage")).some((a) => a.id === "no-delivery")).toBe(true);
    expect(assertionsFor(scenarioConfig("alert-service-outage", { faults: faults })).some((a) => a.id === "no-delivery")).toBe(false);
  });
});
