/**
 * Headless scenario runner for CI.
 *   npm run scenarios -- [--scenario id[,id]] [--mode resilient|faulty|both] [--seed N] [--out dir]
 * Exit code 1 if any resilient-mode scenario fails an assertion. Faulty-mode runs are reported but never fail the run.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildReport, reportToMarkdown, runSuite, suiteExitCode, SCENARIOS, type ResilienceMode } from "../src/engine";

const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
if (args.includes("--help")) {
  console.log("Usage: npm run scenarios -- [--scenario id[,id]] [--mode resilient|faulty|both] [--seed N] [--out dir]\nScenarios: " + SCENARIOS.map((s) => s.id).join(", "));
  process.exit(0);
}
const scenarios = opt("scenario")?.split(",");
const unknown = scenarios?.filter((s) => !SCENARIOS.some((x) => x.id === s));
if (unknown?.length) {
  console.error(`Unknown scenario(s): ${unknown.join(", ")}`);
  process.exit(2);
}
const modeArg = opt("mode") ?? "resilient";
if (!["resilient", "faulty", "both"].includes(modeArg)) {
  console.error(`--mode must be resilient, faulty or both (got "${modeArg}")`);
  process.exit(2);
}
const modes: ResilienceMode[] = modeArg === "both" ? ["resilient", "faulty"] : [modeArg as ResilienceMode];
const seedArg = opt("seed");
if (seedArg !== undefined && !Number.isInteger(Number(seedArg))) {
  console.error("--seed must be an integer");
  process.exit(2);
}
const out = opt("out");

const rows = runSuite({ scenarios, modes, seed: seedArg === undefined ? undefined : Number(seedArg) });
for (const r of rows) {
  const ev = r.evaluation;
  const applicable = ev.assertions.filter((a) => a.status !== "not_applicable");
  const passed = applicable.filter((a) => a.status === "passed").length;
  const mark = ev.verdict === "passed" ? "PASS" : "FAIL";
  console.log(`${mark}  ${r.scenarioId.padEnd(22)} ${r.mode.padEnd(9)} seed ${r.seed}  assertions ${passed}/${applicable.length}`);
  for (const a of ev.assertions.filter((x) => x.status === "failed")) console.log(`        ✗ ${a.title}\n          ${a.actual}`);
  if (out) {
    mkdirSync(out, { recursive: true });
    const rep = buildReport(ev, { experimentId: `cli_${r.scenarioId}_${r.mode}`, runTimestamp: new Date().toISOString() });
    writeFileSync(path.join(out, `${r.scenarioId}.${r.mode}.json`), JSON.stringify(rep, null, 2));
    writeFileSync(path.join(out, `${r.scenarioId}.${r.mode}.md`), reportToMarkdown(rep));
  }
}
const code = suiteExitCode(rows);
console.log(code === 0 ? "\nSuite OK (all resilient scenarios passed)." : "\nSuite FAILED: a resilient scenario failed its assertions.");
process.exit(code);
