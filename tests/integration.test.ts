import { describe, expect, it } from "vitest";
import { buildReport, reportToMarkdown, runComparison, runExperiment, SCENARIOS, scenarioConfig, REPORT_SCHEMA_VERSION } from "@/engine";

describe("scenario library", () => {
  it("has at least seven scenarios with full metadata", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(7);
    for (const s of SCENARIOS) {
      expect(s.hypothesis.length).toBeGreaterThan(20);
      expect(s.assertions.length).toBeGreaterThan(2);
      expect(s.relevantMetrics.length).toBeGreaterThan(0);
      expect(s.initialConditions).toBeTruthy();
      expect(s.expectedBehavior).toBeTruthy();
    }
  });
  for (const s of SCENARIOS) {
    it(`${s.id}: resilient mode passes all its assertions`, () => {
      const ev = runExperiment(scenarioConfig(s.id, { mode: "resilient" }));
      const failed = ev.assertions.filter((a) => a.status === "failed");
      expect(failed.map((a) => `${a.title}: ${a.actual}`)).toEqual([]);
      expect(ev.verdict).toBe("passed");
      expect(ev.assertions.filter((a) => a.status === "passed").length).toBeGreaterThan(0);
    });
  }
  const expectedFaultyFailures: Record<string, string[]> = {
    "healthy-baseline": [],
    "delayed-readings": ["stale"],
    "duplicate-events": ["dup-rejected", "dup-alerts"],
    "alert-service-outage": ["queued", "after-recovery", "no-unexpected-loss"],
    "packet-loss": ["gaps"],
    "recovery-backlog": ["backlog", "after-recovery", "no-unexpected-loss"],
    "out-of-order": ["no-overwrite"],
  };
  for (const [id, ids] of Object.entries(expectedFaultyFailures)) {
    it(`${id}: faulty reference mode fails exactly the intended assertions`, () => {
      const ev = runExperiment(scenarioConfig(id, { mode: "faulty" }));
      expect(ev.assertions.filter((a) => a.status === "failed").map((a) => a.id).sort()).toEqual([...ids].sort());
      expect(ev.verdict).toBe(ids.length ? "failed" : "passed");
    });
  }
});

describe("outage behavior end to end", () => {
  it("queue builds during the outage and drains after recovery", () => {
    const ev = runExperiment(scenarioConfig("alert-service-outage"));
    const { samples } = ev.result;
    const during = samples.filter((s) => s.t >= 60 && s.t <= 120).map((s) => s.depth.delivery);
    expect(Math.max(...during)).toBeGreaterThan(0);
    expect(samples.at(-1)!.depth.delivery).toBe(0);
    const rec = ev.result.services.delivery.recoveries[0];
    expect(rec.initiatedAt).toBe(120);
    expect(ev.metrics.recoveryTimeSec).toBe(Math.round((rec.completedAt! - 120) * 1000) / 1000);
  });
});

describe("comparison", () => {
  it("compares baseline, faulted and alternate mode on the same seed and volume", () => {
    const c = runComparison(scenarioConfig("alert-service-outage"));
    expect(c.baseline.metrics.readingsGenerated).toBe(c.faulted.metrics.readingsGenerated);
    expect(c.baseline.metrics.alertsExpected).toBe(c.faulted.metrics.alertsExpected);
    expect(c.alternate.result.config.mode).toBe("faulty");
    expect(c.baseline.metrics.deliveryRate.value).toBe(1);
    expect(c.alternate.metrics.deliveryRate.value as number).toBeLessThan(1);
  });
});

describe("report export", () => {
  const ev = runExperiment(scenarioConfig("duplicate-events", { mode: "faulty" }));
  const rep = buildReport(ev, { experimentId: "exp_test", runTimestamp: "2026-01-01T00:00:00.000Z" });
  it("JSON matches the completed run", () => {
    expect(rep.schemaVersion).toBe(REPORT_SCHEMA_VERSION);
    expect(rep.seed).toBe(ev.result.config.seed);
    expect(rep.resilienceMode).toBe("faulty");
    expect(rep.metrics.duplicatesAccepted).toBe(ev.result.counters.duplicatesAccepted);
    expect(rep.eventCounts.generated).toBe(ev.result.events.length);
    expect(rep.assertions).toEqual(ev.assertions);
    expect(rep.verdict).toBe("failed");
    expect(rep.relevantEventIds["assertion:dup-rejected"].length).toBeGreaterThan(0);
    expect(rep.failureModes.map((f) => f.id)).toContain("duplicates-accepted");
    expect(rep.limitations.join(" ")).toMatch(/clinical safety/);
    expect(JSON.parse(JSON.stringify(rep))).toEqual(rep);
  });
  it("Markdown contains the same numbers as the run", () => {
    const md = reportToMarkdown(rep);
    expect(md).toContain("exp_test");
    expect(md).toContain(`${ev.result.counters.duplicatesAccepted} duplicate deliveries were accepted`);
    expect(md).toContain("FAILED");
    expect(md).toContain("Seed | 42");
  });
  it("recommendations cite observed evidence", () => {
    const rec = rep.recommendations.find((r) => r.id === "rec-duplicates-accepted")!;
    expect(rec.evidence).toMatch(/\d+ duplicate deliveries were accepted/);
  });
});

describe("sample report", () => {
  it("docs/sample-report.json is current (regenerate with `npm run sample-report`)", async () => {
    const { readFileSync } = await import("node:fs");
    const ev = runExperiment(scenarioConfig("alert-service-outage", { mode: "faulty" }));
    const fresh = buildReport(ev, { experimentId: "exp_sample", runTimestamp: "2026-01-01T00:00:00.000Z" });
    expect(JSON.parse(readFileSync("docs/sample-report.json", "utf8"))).toEqual(JSON.parse(JSON.stringify(fresh)));
  });
});
