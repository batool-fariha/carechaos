/**
 * carechaos: run chaos experiments against your own pipeline profile in CI.
 *
 *   carechaos run [files...] [--scenario id,id] [--mode resilient|faulty|both] [--seed N]
 *                 [--out dir] [--junit file] [--summary file] [--strict]
 *   carechaos validate <files...>
 *   carechaos init [file]
 *   carechaos list
 *
 * Exit codes: 0 ok, 1 an assertion failed, 2 bad usage or invalid file.
 * By default only resilient-mode runs can fail the command (weak-mode runs are reference runs); --strict counts every run.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  APP_VERSION,
  SCENARIOS,
  buildReport,
  parseSuiteFile,
  reportToMarkdown,
  runExperiment,
  toJUnit,
  type Evaluation,
  type LoadedExperiment,
  type ResilienceMode,
  scenarioConfig,
} from "../src/engine";

const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = new Set(["strict", "help"]);
const opts: Record<string, string> = {};
const positional: string[] = [];
for (let i = 1; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith("--")) {
    const k = a.slice(2);
    if (flags.has(k)) opts[k] = "1";
    else opts[k] = argv[++i] ?? "";
  } else positional.push(a);
}

function die(msg: string, code = 2): never {
  console.error(msg);
  process.exit(code);
}

const HELP = `carechaos ${APP_VERSION}: chaos experiments for patient-monitoring pipelines (simulation only)

Usage:
  carechaos run [files...]   Run experiment files (JSON). Also: --scenario id,id for built-in scenarios
  carechaos validate <files> Check files without running them
  carechaos init [file]      Write an example experiment file (default carechaos.json)
  carechaos list             List built-in scenarios

Options for run:
  --mode resilient|faulty|both   Which implementation to simulate (default resilient)
  --seed N                       Override the seed
  --out DIR                      Write JSON and Markdown reports per run
  --junit FILE                   Write JUnit XML (one test case per assertion)
  --summary FILE                 Write a Markdown summary (e.g. $GITHUB_STEP_SUMMARY)
  --strict                       Weak-mode failures also fail the command

Exit codes: 0 ok, 1 assertion failed, 2 bad usage or invalid file.`;

function readJson(file: string): unknown {
  if (!existsSync(file)) die(`File not found: ${file}`);
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    die(`${file}: not valid JSON (${e instanceof Error ? e.message : e})`);
  }
}

function load(file: string): LoadedExperiment[] {
  const r = parseSuiteFile(readJson(file));
  if (!r.ok) die(`${file} is invalid:\n  - ${r.errors.join("\n  - ")}`);
  return r.experiments;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "experiment";

if (!cmd || cmd === "help" || opts.help) {
  console.log(HELP);
  process.exit(cmd ? 0 : 2);
}

if (cmd === "list") {
  for (const s of SCENARIOS) console.log(`${s.id.padEnd(24)} ${s.name}`);
  process.exit(0);
}

if (cmd === "init") {
  const file = positional[0] ?? "carechaos.json";
  if (existsSync(file)) die(`${file} already exists; not overwriting.`);
  const example = {
    name: "Checkout alerts survive a delivery outage",
    scenario: "alert-service-outage",
    pipeline: {
      capacities: { processor: 15, delivery: 6 },
      retry: { maxRetries: 8, baseSec: 1, capSec: 8 },
      alertRules: { heart_rate: { op: ">", threshold: 130 } },
    },
    assertions: [
      { kind: "no_work_during_outage", title: "No alert is delivered while delivery is down" },
      { kind: "processed_after_recovery", title: "Queued alerts are delivered after recovery" },
      { kind: "recovery_time_max", title: "Recovery within 90 s", params: { maxSec: 90 } },
      { kind: "no_unexpected_loss", title: "Nothing is lost" },
    ],
  };
  writeFileSync(file, JSON.stringify(example, null, 2) + "\n");
  console.log(`Wrote ${file}. Run it with: carechaos run ${file}`);
  process.exit(0);
}

if (cmd === "validate") {
  if (!positional.length) die("Usage: carechaos validate <files...>");
  for (const f of positional) {
    const exps = load(f);
    console.log(`OK  ${f} (${exps.length} experiment${exps.length === 1 ? "" : "s"})`);
  }
  process.exit(0);
}

if (cmd !== "run") die(`Unknown command "${cmd}".\n\n${HELP}`);

const modeArg = opts.mode ?? "resilient";
if (!["resilient", "faulty", "both"].includes(modeArg)) die(`--mode must be resilient, faulty or both (got "${modeArg}")`);
const modes: ResilienceMode[] = modeArg === "both" ? ["resilient", "faulty"] : [modeArg as ResilienceMode];
if (opts.seed !== undefined && !Number.isInteger(Number(opts.seed))) die("--seed must be an integer");

const jobs: LoadedExperiment[] = positional.flatMap(load);
if (opts.scenario) {
  for (const id of opts.scenario.split(",")) {
    if (!SCENARIOS.some((s) => s.id === id)) die(`Unknown scenario "${id}". Try: carechaos list`);
    jobs.push({ config: scenarioConfig(id) });
  }
}
if (!jobs.length) die("Nothing to run. Pass experiment files or --scenario. See: carechaos --help");

interface Row {
  name: string;
  mode: ResilienceMode;
  evaluation: Evaluation;
}
const rows: Row[] = [];
for (const job of jobs) {
  for (const mode of modes) {
    const config = { ...job.config, mode, ...(opts.seed !== undefined ? { seed: Number(opts.seed) } : {}) };
    rows.push({ name: config.name, mode, evaluation: runExperiment(config, job.assertions) });
  }
}

const md: string[] = ["## CareChaos results", "", "| Experiment | Mode | Verdict | Assertions |", "|---|---|---|---|"];
for (const r of rows) {
  const ev = r.evaluation;
  const applicable = ev.assertions.filter((a) => a.status !== "not_applicable");
  const passed = applicable.filter((a) => a.status === "passed").length;
  console.log(`${ev.verdict === "passed" ? "PASS" : "FAIL"}  ${r.name}  [${r.mode}]  seed ${ev.result.config.seed}  assertions ${passed}/${applicable.length}`);
  for (const a of ev.assertions.filter((x) => x.status === "failed")) console.log(`        ✗ ${a.title}\n          ${a.actual}`);
  md.push(`| ${r.name} | ${r.mode} | ${ev.verdict === "passed" ? "✅ passed" : "❌ failed"} | ${passed}/${applicable.length} |`);
  if (opts.out) {
    mkdirSync(opts.out, { recursive: true });
    const base = path.join(opts.out, `${slug(r.name)}.${r.mode}`);
    const rep = buildReport(ev, { experimentId: `cli_${slug(r.name)}_${r.mode}`, runTimestamp: new Date().toISOString() });
    writeFileSync(`${base}.json`, JSON.stringify(rep, null, 2));
    writeFileSync(`${base}.md`, reportToMarkdown(rep));
  }
}
const failedRows = rows.filter((r) => r.evaluation.verdict === "failed");
if (failedRows.length) {
  md.push("", "### Failed assertions", "");
  for (const r of failedRows) for (const a of r.evaluation.assertions.filter((x) => x.status === "failed")) md.push(`- **${r.name}** [${r.mode}]: ${a.title} — ${a.actual}`);
}
md.push("", "_Simulation only. All data is fictional; a pass does not establish clinical safety._");
if (opts.junit) {
  mkdirSync(path.dirname(path.resolve(opts.junit)), { recursive: true });
  writeFileSync(opts.junit, toJUnit(rows));
}
if (opts.summary) writeFileSync(opts.summary, md.join("\n") + "\n", { flag: "a" });

const counting = rows.filter((r) => opts.strict || r.mode === "resilient");
const code = counting.some((r) => r.evaluation.verdict !== "passed") ? 1 : 0;
console.log(code === 0 ? "\nOK" : "\nFAILED: an assertion did not hold.");
process.exit(code);
