import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIOS, configToFile, parseSuiteFile, runExperiment, toJUnit, validateConfig } from "@/engine";

describe("experiment files", () => {
  it("resolves a scenario preset plus overrides into a valid config", () => {
    const r = parseSuiteFile({ scenario: "alert-service-outage", name: "mine", seed: 9, pipeline: { capacities: { delivery: 5 } } });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const c = r.experiments[0].config;
    expect(c.name).toBe("mine");
    expect(c.seed).toBe(9);
    expect(c.pipeline?.capacities?.delivery).toBe(5);
    expect(c.faults[0].type).toBe("outage");
    expect(c.interventions).toEqual([]);
  });
  it("builds a custom experiment from scratch and supports custom assertions", () => {
    const r = parseSuiteFile({ faults: [{ type: "packet_loss", target: "ingestion", startSec: 0, durationSec: 100, intensity: 0.2, delaySec: 0 }], assertions: [{ kind: "loss_rate_within", params: { tolerance: 0.2 } }] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ev = runExperiment(r.experiments[0].config, r.experiments[0].assertions);
    expect(ev.assertions).toHaveLength(1);
    expect(ev.assertions[0].status).toBe("passed");
  });
  it("accepts a list of experiments", () => {
    const r = parseSuiteFile({ experiments: [{ scenario: "healthy-baseline" }, { scenario: "packet-loss" }] });
    expect(r.ok && r.experiments.length).toBe(2);
  });
  it("reports every problem with a path", () => {
    const r = parseSuiteFile({ experiments: [{ scenario: "nope" }, { scenario: "healthy-baseline", eventCount: 5000, bogus: 1 }] });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors.join("\n")).toMatch(/bogus|Unrecognized/);
    const r2 = parseSuiteFile({ scenario: "nope" });
    expect(!r2.ok && r2.errors[0]).toMatch(/unknown scenario "nope"/);
    const r3 = parseSuiteFile({ scenario: "alert-service-outage", durationSec: 30 });
    expect(!r3.ok && r3.errors.join(" ")).toMatch(/window|duration/i);
    const r4 = parseSuiteFile({ assertions: [{ kind: "made_up" }] });
    expect(r4.ok).toBe(false);
  });
  it("round-trips a config through a file", () => {
    const first = parseSuiteFile({ scenario: "game-day" });
    if (!first.ok) throw new Error("parse");
    const again = parseSuiteFile(configToFile(first.experiments[0].config));
    expect(again.ok && validateConfig(again.experiments[0].config).ok).toBe(true);
    expect(again.ok && again.experiments[0].config.faults).toEqual(first.experiments[0].config.faults);
  });
  it("up to 12 faults are allowed, 13 are not", () => {
    const f = { type: "latency", target: "processor", startSec: 1, durationSec: 5, intensity: 1, delaySec: 2 };
    expect(parseSuiteFile({ scenario: "healthy-baseline", faults: Array(12).fill(f) }).ok).toBe(true);
    expect(parseSuiteFile({ scenario: "healthy-baseline", faults: Array(13).fill(f) }).ok).toBe(false);
  });
});

describe("game day scenario", () => {
  it("is in the library with five faults and passes in resilient mode", () => {
    const s = SCENARIOS.find((x) => x.id === "game-day")!;
    expect(s.faults).toHaveLength(5);
    expect(SCENARIOS.length).toBe(8);
  });
});

describe("JUnit output", () => {
  it("emits a failure element with expected/actual and escapes XML", () => {
    const r = parseSuiteFile({ scenario: "duplicate-events", name: 'a <b> & "c"', mode: "faulty" });
    if (!r.ok) throw new Error("parse");
    const xml = toJUnit([{ name: r.experiments[0].config.name, mode: "faulty", evaluation: runExperiment(r.experiments[0].config) }]);
    expect(xml).toContain("<failure");
    expect(xml).toContain("a &lt;b&gt; &amp; &quot;c&quot;");
    expect(xml).not.toContain("<b>");
    expect(xml).toMatch(/<testsuites name="carechaos" tests="\d+" failures="[1-9]/);
  });
});

describe("carechaos CLI", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cc-cli-"));
  const run = (args: string[]) => spawnSync("npx", ["tsx", "scripts/carechaos.ts", ...args], { encoding: "utf8", cwd: process.cwd() });
  const write = (name: string, v: unknown) => {
    const p = path.join(dir, name);
    writeFileSync(p, JSON.stringify(v));
    return p;
  };

  it("exits 0 for a passing experiment and writes JUnit and a summary", () => {
    const junit = path.join(dir, "out.xml");
    const summary = path.join(dir, "sum.md");
    const r = run(["run", "examples/carechaos.json", "--junit", junit, "--summary", summary]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("PASS");
    expect(readFileSync(junit, "utf8")).toContain("<testsuites");
    expect(readFileSync(summary, "utf8")).toContain("CareChaos results");
  });
  it("exits 1 when an assertion fails", () => {
    const f = write("fail.json", { scenario: "alert-service-outage", assertions: [{ kind: "recovery_time_max", params: { maxSec: 0.1 } }] });
    const r = run(["run", f]);
    expect(r.status).toBe(1);
    expect(r.stdout).toContain("FAIL");
  });
  it("weak-mode failures only fail the build with --strict", () => {
    expect(run(["run", "--scenario", "duplicate-events", "--mode", "faulty"]).status).toBe(0);
    expect(run(["run", "--scenario", "duplicate-events", "--mode", "faulty", "--strict"]).status).toBe(1);
  });
  it("exits 2 for invalid files and unknown commands", () => {
    expect(run(["validate", write("bad.json", { scenario: "nope" })]).status).toBe(2);
    expect(run(["run", path.join(dir, "missing.json")]).status).toBe(2);
    expect(run(["frobnicate"]).status).toBe(2);
    expect(run(["run"]).status).toBe(2);
  });
});
