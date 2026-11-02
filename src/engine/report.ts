/** Stable report export (JSON schema v1.0, Markdown). Generated only from completed experiment data. */
import { APP_VERSION, ENGINE_VERSION } from "./config";
import type { AssertionOutcome } from "./assertions";
import { buildRecommendations, detectFailureModes, type Insight, type Recommendation } from "./insights";
import type { Evaluation } from "./run";
import { getScenario } from "./scenarios";
import type { ExperimentConfig, FaultConfig } from "./types";

export const REPORT_SCHEMA_VERSION = "1.0";

export const REPORT_LIMITATIONS = [
  "All data is synthetic and fictional. Readings are not medical observations.",
  "Alert thresholds are illustrative demo values and are not medically validated.",
  "Results describe a simulated pipeline model, not any real product or company's infrastructure.",
  "A passing experiment does not establish clinical safety or regulatory compliance.",
  "Time is virtual; latencies are model outputs, not real-world performance measurements.",
];

export interface Report {
  schemaVersion: string;
  generator: { name: "CareChaos"; appVersion: string; engineVersion: string };
  experimentId: string;
  runTimestamp: string;
  runStatus: string;
  verdict: string;
  scenario: { id: string; name: string; hypothesis: string | null };
  seed: number;
  resilienceMode: string;
  configuration: ExperimentConfig;
  injectedFaults: (FaultConfig & { source: "scenario" | "operator" })[];
  eventCounts: Record<string, number>;
  metrics: Evaluation["metrics"];
  assertions: AssertionOutcome[];
  recoveryTimeline: { t: number; kind: string; service: string | null; detail: string }[];
  relevantEventIds: Record<string, string[]>;
  failureModes: Insight[];
  recommendations: Recommendation[];
  limitations: string[];
}

export function buildReport(ev: Evaluation, opts: { experimentId: string; runTimestamp: string }): Report {
  const { result: r, metrics: m } = ev;
  const cfg = r.config;
  const scenario = getScenario(cfg.scenarioId);
  const operator = cfg.interventions.flatMap((iv) => (iv.type === "inject" ? [iv.fault] : []));
  const failureModes = detectFailureModes(r, m);
  const relevant: Record<string, string[]> = {};
  for (const a of ev.assertions) if (a.eventIds.length) relevant[`assertion:${a.id}`] = a.eventIds;
  for (const f of failureModes) if (f.eventIds.length) relevant[`failure_mode:${f.id}`] = f.eventIds;
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    generator: { name: "CareChaos", appVersion: APP_VERSION, engineVersion: ENGINE_VERSION },
    experimentId: opts.experimentId,
    runTimestamp: opts.runTimestamp,
    runStatus: r.status,
    verdict: ev.verdict,
    scenario: { id: cfg.scenarioId, name: scenario?.name ?? cfg.scenarioId, hypothesis: scenario?.hypothesis ?? null },
    seed: cfg.seed,
    resilienceMode: cfg.mode,
    configuration: cfg,
    injectedFaults: [...cfg.faults.map((f) => ({ ...f, source: "scenario" as const })), ...operator.map((f) => ({ ...f, source: "operator" as const }))],
    eventCounts: {
      generated: m.readingsGenerated,
      processed: m.readingsProcessed,
      alertsExpected: m.alertsExpected,
      alertsDelivered: m.alertsDelivered,
      duplicatesInjected: m.duplicatesInjected,
      duplicatesRejected: m.duplicatesRejected,
      duplicatesAccepted: m.duplicatesAccepted,
      dropped: m.eventsDropped,
      deadLettered: m.eventsDeadLettered,
      ...Object.fromEntries(Object.entries(m.outcomes).map(([k, v]) => [`status_${k}`, v])),
    },
    metrics: m,
    assertions: ev.assertions,
    recoveryTimeline: r.timeline
      .filter((t) => ["fault_started", "fault_ended", "service_state", "recovery_initiated", "recovery_completed", "intervention", "run_stopped"].includes(t.kind))
      .map((t) => ({ t: t.t, kind: t.kind, service: t.service ?? null, detail: t.detail })),
    relevantEventIds: relevant,
    failureModes,
    recommendations: buildRecommendations(r, m),
    limitations: REPORT_LIMITATIONS,
  };
}

const pct = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 1000) / 10}%`);
const sec = (n: number | null) => (n === null ? "n/a" : `${Math.round(n * 100) / 100}s`);

export function reportToMarkdown(rep: Report): string {
  const m = rep.metrics;
  const L: string[] = [];
  L.push(`# CareChaos report: ${rep.configuration.name}`, "");
  L.push(`> Simulation only. All data is synthetic. This report does not establish clinical safety or regulatory compliance.`, "");
  L.push(`| Field | Value |`, `|---|---|`);
  L.push(`| Experiment ID | \`${rep.experimentId}\` |`, `| Run timestamp | ${rep.runTimestamp} |`, `| App version | ${rep.generator.appVersion} (engine ${rep.generator.engineVersion}) |`);
  L.push(`| Scenario | ${rep.scenario.name} (\`${rep.scenario.id}\`) |`, `| Seed | ${rep.seed} |`, `| Resilience mode | ${rep.resilienceMode} |`);
  L.push(`| Run status | ${rep.runStatus} |`, `| Verdict | **${rep.verdict}** |`, "");
  if (rep.scenario.hypothesis) L.push(`**Hypothesis:** ${rep.scenario.hypothesis}`, "");
  L.push(`## Configuration`, "", "```json", JSON.stringify({ ...rep.configuration, interventions: undefined, faults: undefined }, null, 2), "```", "");
  L.push(`## Injected faults`, "");
  if (!rep.injectedFaults.length) L.push("None (baseline).");
  for (const f of rep.injectedFaults) L.push(`- **${f.type}** on \`${f.target}\` from ${f.startSec}s, duration ${f.durationSec ?? "until manual recovery"}, intensity ${f.intensity}, delay ${f.delaySec}s (${f.source})`);
  L.push("", `## Event counts`, "", `| Count | Value |`, `|---|---|`);
  for (const [k, v] of Object.entries(rep.eventCounts)) L.push(`| ${k} | ${v} |`);
  L.push("", `## Metrics`, "", `| Metric | Value | Basis |`, `|---|---|---|`);
  const ratioRow = (name: string, r: { value: number | null; numerator: number; denominator: number; label: string; note?: string }) =>
    L.push(`| ${name} | ${pct(r.value)} (${r.numerator}/${r.denominator}) | ${r.label}${r.note ? ` — ${r.note}` : ""} |`);
  ratioRow("Delivery rate", m.deliveryRate);
  ratioRow("Processing success rate", m.processingSuccessRate);
  ratioRow("Duplicate rejection rate", m.duplicateRejectionRate);
  L.push(`| Reading latency (median / p95, s) | ${sec(m.readingLatency.medianSec)} / ${sec(m.readingLatency.p95Sec)} (n=${m.readingLatency.n}) | ${m.readingLatency.basis} |`);
  L.push(`| Alert latency (median / p95, s) | ${sec(m.alertLatency.medianSec)} / ${sec(m.alertLatency.p95Sec)} (n=${m.alertLatency.n}) | ${m.alertLatency.basis} |`);
  L.push(`| Recovery time | ${sec(m.recoveryTimeSec)} | virtual seconds from restore until backlog drained and service healthy |`);
  L.push(`| Peak queue depth | ${m.peakQueueDepth}${m.peakQueueService ? ` (${m.peakQueueService})` : ""} | queued + retry-held + dead-lettered events |`);
  L.push(`| Reading loss | ${m.readingLoss.total} (intentional ${m.readingLoss.intentional}, unexpected ${m.readingLoss.unexpected}, pending ${m.readingLoss.pending}) | readings not processed by end of window |`);
  if (m.assertionPassRate) ratioRow("Assertion pass rate", m.assertionPassRate);
  L.push("", `## Assertions`, "");
  if (!rep.assertions.length) L.push("Not evaluated (run was not completed).");
  for (const a of rep.assertions) L.push(`- **${a.status.toUpperCase()}** — ${a.title}  \n  expected: ${a.expected}  \n  actual: ${a.actual}${a.eventIds.length ? `  \n  events: ${a.eventIds.slice(0, 8).join(", ")}` : ""}`);
  L.push("", `## Recovery timeline`, "");
  for (const t of rep.recoveryTimeline) L.push(`- ${sec(t.t)} — ${t.detail}`);
  L.push("", `## Detected failure modes`, "");
  if (!rep.failureModes.length) L.push("None detected.");
  for (const f of rep.failureModes) L.push(`- **${f.title}** — ${f.evidence}`);
  L.push("", `## Recommendations`, "");
  for (const x of rep.recommendations) L.push(`- **${x.title}** — ${x.action}  \n  Evidence: ${x.evidence}`);
  L.push("", `## Limitations`, "");
  for (const l of rep.limitations) L.push(`- ${l}`);
  return L.join("\n") + "\n";
}
