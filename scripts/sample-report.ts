/** Regenerates docs/sample-report.{json,md} from the alert-service-outage scenario (fixed seed, fixed timestamp). */
import { mkdirSync, writeFileSync } from "node:fs";
import { buildReport, reportToMarkdown, runExperiment, scenarioConfig } from "../src/engine";

const ev = runExperiment(scenarioConfig("alert-service-outage", { mode: "faulty" }));
const report = buildReport(ev, { experimentId: "exp_sample", runTimestamp: "2026-01-01T00:00:00.000Z" });
mkdirSync("docs", { recursive: true });
writeFileSync("docs/sample-report.json", JSON.stringify(report, null, 2) + "\n");
writeFileSync("docs/sample-report.md", reportToMarkdown(report));
console.log("wrote docs/sample-report.json and docs/sample-report.md");
